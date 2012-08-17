// hardware_buttons.js:
//
// Gecko code in b2g/chrome/content/shell.js sends mozChromeEvents
// when the user presses or releases a hardware button such as Home, Sleep,
// and Volume Up and Down.
//
// This module listens for those low-level mozChromeEvents, processes them
// and generates higher-level events to handle autorepeat on the volume keys
// long presses on Home and Sleep, and the Home+Sleep key combination.
//
// Other system app modules should listen for the high-level button events
// generated by this module.
//
// The low-level input events processed by this module have type set
// to "mozChromeEvent" and detail.type set to one of:
//
//   home-button-press
//   home-button-release
//   sleep-button-press
//   sleep-button-release
//   volume-up-button-press
//   volume-up-button-release
//   volume-down-button-press
//   volume-down-button-release
//
// The high-level events generated by this module are simple Event objects
// that are not cancelable and do not bubble.  The are dispatched at the
// window object.  The type property is set to one of these:
//
// Event Type    Meaning
// --------------------------------------------------------------
//   home        short press and release of home button
//   holdhome    long press and hold of home button
//   sleep       short press and release of sleep button
//   wake        sleep or home pressed while sleeping
//   holdsleep   long press and hold of sleep button
//   volumeup    volume up pressed and released or autorepeated
//   volumedown  volume down pressed and released or autorepeated
//   home+sleep  home and sleep pressed at same time (used for screenshots)
//   home+volume home and either volume key at the same time (view source)
//
// Because these events are fired at the window object, they cannot be
// captured.  Many modules listen for the home event. Those that want
// to respond to it and prevent others from responding should call
// stopImmediatePropagation(). Overlays that want to prevent the window
// manager from showing the homescreen on the home event should call that
// method.  Note, however, that this only works for scripts that run and
// register their event handlers before window_manager.js does.
//
'use strict';

(function() {
  var HOLD_INTERVAL = 1500;   // How long for press and hold Home or Sleep
  var REPEAT_DELAY = 700;     // How long before volume autorepeat begins
  var REPEAT_INTERVAL = 100;  // How fast the autorepeat is.

  // Dispatch a high-level event of the specified type
  function fire(type) {
    window.dispatchEvent(new Event(type));
  }

  // We process events with a finite state machine.
  // Each state object has a process() method for handling events.
  // And optionally has enter() and exit() methods called when the FSM
  // enters and exits that state
  var state;

  // This function transitions to a new state
  function setState(s, type) {
    // Exit the current state()
    if (state && state.exit)
      state.exit(type);
    state = s;
    // Enter the new state
    if (state && state.enter)
      state.enter(type);
  }

  // This event handler listens for hardware button events and passes the
  // event type to the process() method of the current state for processing
  window.addEventListener('mozChromeEvent', function(e) {
    var type = e.detail.type;
    switch (type) {
      case 'home-button-press':
      case 'home-button-release':
      case 'sleep-button-press':
      case 'sleep-button-release':
      case 'volume-up-button-press':
      case 'volume-up-button-release':
      case 'volume-down-button-press':
      case 'volume-down-button-release':
        state.process(type);
        break;
    }
  });

  // The base state is the default, when no hardware buttons are pressed
  var baseState = {
    process: function(type) {
      switch (type) {
      case 'home-button-press':
        // If the phone is sleeping, then pressing Home wakes it
        // (on press, not release)
        if (!ScreenManager.screenEnabled) {
          fire('wake');
          setState(wakeState, type);
        } else {
          setState(homeState, type);
        }
        return;
      case 'sleep-button-press':
        // If the phone is sleeping, then pressing Sleep wakes it
        // (on press, not release)
        if (!ScreenManager.screenEnabled) {
          fire('wake');
          setState(wakeState, type);
        } else {
          setState(sleepState, type);
        }
        return;
      case 'volume-up-button-press':
      case 'volume-down-button-press':
        setState(volumeState, type);
        return;
      case 'home-button-release':
      case 'sleep-button-release':
      case 'volume-up-button-release':
      case 'volume-down-button-release':
        // Ignore button releases that occur in this state.
        // These can happen after home+sleep and home+volume.
        return;
      }
      console.error('Unexpected hardware key: ', type);
    }
  };

  // We enter the home state when the user presses the Home button
  // We can fire home, holdhome, or homesleep events from this state
  var homeState = {
    timer: null,
    enter: function() {
      this.timer = setTimeout(function() {
        fire('holdhome');
        setState(baseState);
      }, HOLD_INTERVAL);
    },
    exit: function() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    process: function(type) {
      switch (type) {
      case 'home-button-release':
        fire('home');
        setState(baseState, type);
        return;
      case 'sleep-button-press':
        fire('home+sleep');
        setState(baseState, type);
        return;
      case 'volume-up-button-press':
      case 'volume-down-button-press':
        fire('home+volume');
        setState(baseState, type);
        return;
      }
      console.error('Unexpected hardware key: ', type);
      setState(baseState, type);
    }
  };

  // We enter the sleep state when the user presses the Sleep button
  // We can fire sleep, holdsleep, or homesleep events from this state
  var sleepState = {
    timer: null,
    enter: function() {
      this.timer = setTimeout(function() {
        fire('holdsleep');
        setState(baseState);
      }, HOLD_INTERVAL);
    },
    exit: function() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    process: function(type) {
      switch (type) {
      case 'sleep-button-release':
        fire('sleep');
        setState(baseState, type);
        return;
      case 'home-button-press':
        fire('home+sleep');
        setState(baseState, type);
        return;
      case 'volume-up-button-press':
      case 'volume-down-button-press':
        setState(volumeState, type);
        return;
      }
      console.error('Unexpected hardware key: ', type);
      setState(baseState, type);
    }
  };

  // We enter the volume state when the user presses the volume up or
  // volume down buttons.
  // We can fire volumeup and volumedown events from this state
  var volumeState = {
    direction: null,
    timer: null,
    repeating: false,
    repeat: function() {
      this.repeating = true;
      if (this.direction === 'volume-up-button-press')
        fire('volumeup');
      else
        fire('volumedown');
      this.timer = setTimeout(this.repeat.bind(this), REPEAT_INTERVAL);
    },
    enter: function(type) {
      var self = this;
      this.direction = type;  // Is volume going up or down?
      this.repeating = false;
      this.timer = setTimeout(this.repeat.bind(this), REPEAT_DELAY);
    },
    exit: function() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    process: function(type) {
      switch (type) {
      case 'home-button-press':
        fire('home+volume');
        setState(baseState, type);
        return;
      case 'sleep-button-press':
        setState(sleepState, type);
        return;
      case 'volume-up-button-release':
        if (this.direction === 'volume-up-button-press') {
          if (!this.repeating)
            fire('volumeup');
          setState(baseState, type);
          return;
        }
        break;
      case 'volume-down-button-release':
        if (this.direction === 'volume-down-button-press') {
          if (!this.repeating)
            fire('volumedown');
          setState(baseState, type);
          return;
        }
        break;
      default:
        // Ignore anything else (such as sleep button release)
        return;
      }
      console.error('Unexpected hardware key: ', type);
      setState(baseState, type);
    }
  };

  // We enter this state when the user presses Home or Sleep on a sleeping
  // phone.  We give immediate feedback by waking the phone up on the press
  // rather than waiting for the release, but this means we need a special
  // state so that we don't actually send a home or sleep event on the
  // key release.  Note, however, that this state does set a timer so that
  // it can send holdhome or holdsleep events.  (This means that pressing and
  // holding sleep will bring up the power menu, even on a sleeping phone.)
  var wakeState = {
    timer: null,
    delegateState: null,
    enter: function(type) {
      if (type === 'home-button-press')
        this.delegateState = homeState;
      else
        this.delegateState = sleepState;
      this.timer = setTimeout(function() {
        if (type === 'home-button-press') {
          fire('holdhome');
        } else if (type === 'sleep-button-press') {
          fire('holdsleep');
        }
        setState(baseState, type);
      }, HOLD_INTERVAL);
    },
    exit: function() {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
    process: function(type) {
      switch (type) {
      case 'home-button-release':
      case 'sleep-button-release':
        setState(baseState, type);
        return;
      default:
        this.delegateState.process(type);
        return;
      }
    }
  };

  // Kick off the FSM in the base state
  setState(baseState);
}());
