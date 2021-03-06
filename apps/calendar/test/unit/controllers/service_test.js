requireApp('calendar/test/unit/helper.js', function() {
  requireLib('worker/manager.js');
  requireLib('controllers/service.js');
});

suite('controllers/service', function() {

  var account;
  var calendar;
  var subject;
  var app;

  setup(function() {
    app = testSupport.calendar.app();
    subject = new Calendar.Controllers.Service(app);
  });

  test('initialize', function() {
    assert.instanceOf(
      subject,
      Calendar.Worker.Manager
    );
  });

  test('#start', function() {
    subject.start();

    assert.ok(subject._ensureActiveWorker('caldav'));
  });

/*
// These tests are currently failing and have been temporarily disabled as per
// Bug 838993. They should be fixed and re-enabled as soon as possible as per
// Bug 840489.
  test('caldav worker', function(done) {
    subject.start();

    subject.request('caldav', 'noop', function(data) {
      done(function() {
        assert.deepEqual(data, { ready: true });
      });
    });
  });
*/

  teardown(function() {
    subject.workers.forEach(function(worker) {
      worker.instance.terminate();
      worker.instance = null;
    });
  });

});

