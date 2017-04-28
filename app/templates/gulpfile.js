/*jshint node: true */

'use strict';

var args = require('yargs').argv;
var config = require('./gulp.config')();
var del = require('del');
var fs = require('fs');
var gulp = require('gulp');
var path = require('path');
var replace = require('gulp-replace');
var username = require('username');

/* jshint ignore:start */
var _ = require('lodash');
var $ = require('gulp-load-plugins')({
  lazy: true
});
/* jshint ignore:end */

var _s = require('underscore.string'),
  q = require('q'),
  spawn = require('child_process').spawn;

var encoding = {
  encoding: 'utf8'
};

/**
 * yargs variables can be passed in to alter the behavior, when present.
 * Example: gulp serve-dev
 *
 * --verbose  : Various tasks will produce more output to the console.
 * --nosync   : Don't launch the browser with browser-sync when serving code.
 * --debug  : Launch debugger with node-inspector.
 * --debug-brk: Launch debugger and break on 1st line with node-inspector.
 * --startServers: Will start servers for midway tests on the test task.
 * --ignoreErrors: Don't terminate build at vet or karma errors.
 */

/**
 * List the available gulp tasks
 */
gulp.task('help', $.taskListing);
gulp.task('default', ['help']);

/**
 * vet the code and create coverage report
 * @return {Stream}
 */
gulp.task('vet', function() {
  log('Analyzing source with JSHint and JSCS');

  return gulp
    .src(config.alljs)
    .pipe($.if(args.verbose, $.print()))
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish', {
      verbose: true
    }))
    .pipe($.if(!args.ignoreErrors, $.jshint.reporter('fail')))
    .pipe($.jscs())
    .pipe($.jscs.reporter())
    .pipe($.if(!args.ignoreErrors, $.jscs.reporter('fail')));
});


/**
 * Compile less to css
 * @return {Stream}
 */
gulp.task('styles', ['clean-styles'], function() {
  log('Compiling Less --> CSS');

  var less = $.less().on('error', function(e) {
    $.util.log($.util.colors.red(e));
    this.emit('end', e);
  });

  return gulp
    .src(config.mainLess)
    .pipe($.plumber()) // exit gracefully if something fails after this
    .pipe(less)
    .pipe($.autoprefixer({
      browsers: ['last 2 version', '> 5%']
    }))
    .pipe(gulp.dest(config.cssDir))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Copy fonts
 * @return {Stream}
 */
gulp.task('fonts', ['clean-fonts'], function() {
  log('Copying fonts');

  return gulp
    .src(config.fonts)
    .pipe(gulp.dest(config.client + 'fonts'));
});

/**
- * Copy static data like lang.json
- * @return {Stream}
- */
gulp.task('statics', function() {
  log('Copying statics');

  return gulp
    .src(config.staticdata)
    .pipe(gulp.dest(config.build))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Copy tinymce files
 * @return {Stream}
 */
gulp.task('tinymce', function() {
  log('Copying tinymce files');

  return gulp
    .src(config.tinymce, {
      base: './bower_components/tinymce-dist'
    })
    .pipe(gulp.dest(config.build + 'js/'))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Compress images
 * @return {Stream}
 */
gulp.task('images', ['clean-images'], function() {
  log('Compressing and copying images');

  return gulp
    .src(config.images)
    .pipe($.imagemin({
      optimizationLevel: 4
    }))
    .pipe(gulp.dest(config.build + 'images'))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Watch for less file changes
 * @return {Stream}
 */
gulp.task('less-watcher', function() {
  return gulp.watch([config.less], ['styles']);
});

/**
 * Create $templateCache from the html templates
 * @return {Stream}
 */
gulp.task('templatecache', ['clean-code'], function() {
  log('Creating an AngularJS $templateCache');

  return gulp
    .src(config.htmltemplates)
    .pipe($.if(args.verbose, $.bytediff.start()))
    .pipe($.htmlmin())
    .pipe($.if(args.verbose, $.bytediff.stop(bytediffFormatter)))
    .pipe($.angularTemplatecache(
      config.templateCache.file,
      config.templateCache.options
    ))
    .pipe(gulp.dest(config.client))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Wire-up the bower dependencies
 * @return {Stream}
 */
gulp.task('wiredep', function() {
  log('Wiring the bower dependencies into the html');

  var wiredep = require('wiredep').stream;
  var options = config.getWiredepDefaultOptions();

  // Only include stubs if flag is enabled
  var js = args.stubs ? [].concat(config.js, config.stubsjs) : config.js;

  return gulp
    .src(config.index)
    .pipe(wiredep(options))
    .pipe(inject(js, '', config.jsOrder))
    .pipe(replace('/wwwroot', ''))
    .pipe(gulp.dest(config.client))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Inject dependencies into index.html
 * @return {Stream}
 */
gulp.task('inject', ['wiredep', 'fonts', 'styles', 'templatecache'], function() {
  log('Wire up css into the html, after files are ready');

  return gulp
    .src(config.index)
    .pipe(inject(config.css))
    .pipe(replace('/wwwroot', ''))
    .pipe(gulp.dest(config.client))
    .pipe($.if(args.verbose, $.print()));
});

/**
 * Initialize config files for local environment
 */
gulp.task('init-local', function(done) {
  init('local', done);
});

/**
 * Initialize config files for dev environment
 */
gulp.task('init-dev', function(done) {
  init('dev', done);
});

/**
 * Initialize config files for prod environment
 */
gulp.task('init-prod', function(done) {
  init('prod', done);
});

/**
 * Updates ecosystem.json
 */
gulp.task('add-deploy-target', function(done) {
  log('Update ecosystem.json targets or create new ones!');

  var properties = fs.readFileSync('deploy/build.properties', encoding);

  var name = properties.match(/app-name=(.*)/)[1];
  var gitUrl = 'https://github.com/';
  var folderPath = '/space/projects/' + name;

  var ecosystem = 'ecosystem.json';

  ecosystemMustExist(ecosystem, name);

  $.git.exec({
    args: 'config --get remote.origin.url',
    quiet: true
  }, function(err, stdout) {
    if (!err) {
      gitUrl = stdout.split('\n')[0];
    }

    var questions = [{
      type: 'input',
      name: 'targetName',
      message: 'What\'s the name of this deployment target? (If this target exists we\'ll replace it!!!!)',
      default: 'prod'
    }, {
      type: 'input',
      name: 'key',
      message: 'Where do you keep your ssh key that\'s used for both the target server and the git repository?',
      default: '~/.ssh/id_rsa'
    }, {
      type: 'input',
      name: 'username',
      message: 'Where\'s your username on the target server?',
      default: username.sync()
    }, {
      type: 'input',
      name: 'hostname',
      message: 'What\'s the hostname of the target server?',
      default: 'localhost'
    }, {
      type: 'input',
      name: 'branch',
      message: 'Which git branch are we deploying?',
      default: 'master'
    }, {
      type: 'input',
      name: 'gitUrl',
      message: 'What\'s the url of your git repository?',
      default: gitUrl
    }, {
      type: 'input',
      name: 'folder',
      message: 'Where do you want to store the project on your target server?',
      default: folderPath
    }, {
      type: 'list',
      name: 'local',
      message: 'Is there any sensitive information or credentials here that shouldn\'t go in source control?',
      choices: ['no', 'yes'],
      default: 0
    }];

    gulp.src(ecosystem)
      .pipe($.prompt.prompt(questions, function(answers) {

        if (answers.local === 'yes') {
          ecosystem = 'local.ecosystem.json';
          ecosystemMustExist(ecosystem, name);
        }

        gulp.src(ecosystem)
          .pipe($.jsonEditor(function(json) {
            json.deploy[answers.targetName] = {
              'key': answers.key,
              'user': answers.username,
              'host': [answers.hostname],
              'ref': 'origin/' + answers.branch,
              'repo': answers.gitUrl,
              'path': answers.folder,
              'post-deploy': 'npm install && bower install && gulp build'
            };
            return json; // must return JSON object.
          }))
          .pipe(gulp.dest('./'));
      }));
  });
});

function ecosystemMustExist(ecosystem, name) {
  if (!fs.existsSync(ecosystem)) {
    try {
      var configJSON = {
        'apps': [{
          'name': name,
          'script': './node-server/node-app.js',
          'watch': true,
          'restart_delay': 4000,
          'env': {
            'NODE_ENV': 'local'
          },
          'env_local': {
            'NODE_ENV': 'local'
          },
          'env_dev': {
            'NODE_ENV': 'dev'
          },
          'env_prod': {
            'NODE_ENV': 'prod'
          }
        }],
        'deploy': {}
      };

      var configString = JSON.stringify(configJSON, null, 2) + '\n';

      fs.writeFileSync(ecosystem, configString, encoding);
    } catch (e) {
      console.log('failed to write ecosystem.json: ' + e.message);
    }
  }
}

/**
 * Build everything
 * This is separate so we can run tests on
 * optimize before handling image or fonts
 * @param  {Function} done - callback when complete
 */
gulp.task('build', ['optimize', 'images', 'fonts', 'statics', 'tinymce'], function(done) {
  log('Building everything');

  var msg = {
    title: 'gulp build',
    subtitle: 'Deployed to the dist folder',
    message: 'Ready to run `gulp serve-dev` or `gulp serve-prod`'
  };
  log(msg);
  notify(msg);
  done();
});

/**
 * Optimize all files, move to a build folder,
 * and inject them into the new index.html
 * @return {Stream}
 */
gulp.task('optimize', ['inject'], function() {
  log('Optimizing the js, css, and html');

  // Filters are named for the gulp-useref path
  var restore = {
    restore: true
  };
  var cssFilter = $.filter('**/*.css', restore);
  var jsAppFilter = $.filter('**/' + config.optimized.app, restore);
  var jslibFilter = $.filter('**/' + config.optimized.lib, restore);

  var templateCache = config.temp + config.templateCache.file;

  var combined = gulp
    .src(config.index)
    .pipe($.plumber())
    .pipe(inject(templateCache, 'templates'))
    // Apply the concat and file replacement with useref
    .pipe($.useref({
      searchPath: './'
    }))
    // Get the css
    .pipe(cssFilter)
    // Take inventory of the css file names for future rev numbers
    .pipe($.rev())
    .pipe($.sourcemaps.init())
    .pipe($.cssnano({
      safe: true
    }))
    // write sourcemap for css
    .pipe($.sourcemaps.write('.'))
    .pipe(cssFilter.restore)
    // Get the custom javascript
    .pipe(jsAppFilter)
    // Take inventory of the js app file name for future rev numbers
    .pipe($.rev())
    .pipe($.sourcemaps.init())
    .pipe($.ngAnnotate({
      add: true
    }))
    .pipe($.uglify())
    // write sourcemap for js app
    .pipe($.sourcemaps.write('.'))
    .pipe(jsAppFilter.restore)
    // Get the vendor javascript
    .pipe(jslibFilter)
    // Take inventory of the js lib file name for future rev numbers
    .pipe($.rev())
    .pipe($.sourcemaps.init())
    .pipe($.uglify()) // another option is to override wiredep to use min files
    // write sourcemap for js lib
    .pipe($.sourcemaps.write('.'))
    .pipe(jslibFilter.restore)
    // Rename the recorded file names in the steam, and in the html to append rev numbers
    .pipe($.revReplace())
    .pipe(replace('/wwwroot', ''))
    // copy result to dist/, and print some logging..
    .pipe(gulp.dest(config.client))
    .pipe($.if(args.verbose, $.print()));

  combined.on('error', console.error.bind(console));

  return combined;
});

/**
 * Remove all files from the build, temp, and reports folders
 * @return {Stream}
 */
gulp.task('clean', ['clean-fonts'], function() {
  var files = [].concat(config.build, config.temp, config.report);
  return clean(files);
});

/**
 * Remove all fonts from the build folder
 * @return {Stream}
 */
gulp.task('clean-fonts', function() {
  var files = [].concat(
    config.client + 'fonts/**/*.*'
  );
  return clean(files);
});

/**
 * Remove all images from the build folder
 * @return {Stream}
 */
gulp.task('clean-images', function() {
  return clean(config.build + 'images/**/*.*');
});

/**
 * Remove all styles from the build and temp folders
 * @return {Stream}
 */
gulp.task('clean-styles', function() {
  var files = [].concat(
    config.cssDir + '**/*.css',
    config.build + 'styles/**/*.css',
    config.build + 'styles/**/*.css.map'
  );
  return clean(files);
});

/**
 * Remove all js and html from the build and temp folders
 * @return {Stream}
 */
gulp.task('clean-code', function() {
  var files = [].concat(
    config.temp + '**/*.js',
    config.build + 'js/**/*.js',
    config.build + 'js/**/*.js.map',
    config.build + '**/*.html'
  );
  return clean(files);
});


/**
 * Delete all files in a given path
 * @param  {Array}   files - array of paths to delete
 * @return {Stream}
 */
function clean(files) {
  log('Cleaning: ' + $.util.colors.blue(files));
  return del(files)
    .then(function(paths) {
      if (args.verbose) {
        log(paths.map(function(path) {
          return path.replace(__dirname + '/', 'rm ');
        }));
      }
    });
}

/**
 * Initialize config files for given env
 * @param   {String} env   The environment name (local, dev, prod)
 * @param  {Function} done - callback when complete
 */
function init(env, done) {
  if (fs.existsSync(env + '.json')) {
    log('NOTE: ' + env + '.json already exists, change manually if needed.');
    if (fs.existsSync('deploy/' + env + '.properties')) {
      log('NOTE: deploy/' + env + '.properties already exists, change manually too.');
    } else {
      log('WARN: deploy/' + env + '.properties is missing!');
    }
    done();
  } else {
    //copy from slushfile - config gulp - with modifications to use config instead
    var inquirer = require('inquirer');

    run('./ml', [env, 'info', '--format=json']).then(function(output) {
      var localJson = fs.existsSync('local.json') ? JSON.parse(fs.readFileSync('local.json', 'utf8')) : {};

      var localAppName = localJson['app-name'];
      var localMlVersion = localJson['ml-version'];
      var localMlHost = localJson['ml-host'];
      var localMlAdminUser = localJson['ml-admin-user'];
      var localMlAppUser = localJson['ml-app-user'];
      var localMlAppPass = localJson['ml-app-pass'];
      var localMlHttpPort = localJson['ml-http-port'];
      var localMlXccPort = localJson['ml-xcc-port'];
      var localNodePort = localJson['node-port'] || 9070;
      var localGuestAccess = ['false', 'true'].indexOf(localJson['guest-access']);
      var localDisallowUpdates = ['false', 'true'].indexOf(localJson['disallow-updates']);
      var localAppUsersOnly = ['false', 'true'].indexOf(localJson['appusers-only']);

      var properties = JSON.parse(output).properties || {};

      var mlVersion = ['8', '7', '6', '5'].indexOf(localMlVersion || properties['ml.server-version'] || '8');
      var marklogicHost = properties['ml.' + env + '-server'] || localMlHost || 'localhost';
      var marklogicAdminUser = properties['ml.user'] || localMlAdminUser || 'admin';
      var appName = properties['ml.app-name'] || localAppName;
      var appUserName = properties['ml.default-user'] || localMlAppUser;
      var appUserPass = unescape(properties['ml.appuser-password']) || localMlAppPass;
      var appPort = localMlHttpPort || properties['ml.app-port'] || 8040;
      var xccPort = localMlXccPort || properties['ml.xcc-port'] || 8041;

      var prompts = [{
        type: 'list',
        name: 'mlVersion',
        message: 'MarkLogic version?',
        choices: ['8', '7', '6', '5'],
        default: mlVersion > 0 ? mlVersion : 0
      }, {
        type: 'input',
        name: 'marklogicHost',
        message: 'MarkLogic Host?',
        default: marklogicHost
      }, {
        type: 'input',
        name: 'marklogicAdminUser',
        message: 'MarkLogic Admin User?',
        default: marklogicAdminUser
      }, {
        type: 'input',
        name: 'marklogicAdminPass',
        message: 'Note: consider keeping the following blank, ' +
          'you will be asked to enter it at appropriate commands.\n? MarkLogic Admin Password?',
        default: ''
      }, {
        type: 'input',
        name: 'appPort',
        message: 'MarkLogic App/Rest port?',
        default: appPort
      }, {
        type: 'input',
        name: 'xccPort',
        message: 'XCC port?',
        default: xccPort,
        when: function(answers) {
          return answers.mlVersion < 8;
        }
      }, {
        type: 'input',
        name: 'nodePort',
        message: 'Node app port?',
        default: localNodePort
      }, {
        type: 'list',
        name: 'guestAccess',
        message: 'Allow anonymous users to search data?',
        choices: ['false', 'true'],
        default: localGuestAccess > 0 ? localGuestAccess : 0
      }, {
        type: 'list',
        name: 'disallowUpdates',
        message: 'Disallow proxying update requests?',
        choices: ['false', 'true'],
        default: localDisallowUpdates > 0 ? localDisallowUpdates : 0
      }, {
        type: 'list',
        name: 'appUsersOnly',
        message: 'Only allow access to users created for this app? Note: disallows admin users.',
        choices: ['false', 'true'],
        default: localAppUsersOnly > 0 ? localAppUsersOnly : 0
      }];

      if (typeof appName === 'undefined') {
        prompts.unshift({
          type: 'input',
          name: 'name',
          message: 'Name for the app?'
        });
      }

      inquirer.prompt(prompts, function(settings) {
        if (typeof appName === 'undefined') {
          settings.nameDashed = _s.slugify(settings.name);
        } else {
          settings.nameDashed = _s.slugify(appName);
        }

        try {
          var configJSON = {};
          configJSON['app-name'] = settings.nameDashed;
          configJSON['ml-version'] = settings.mlVersion;
          configJSON['ml-host'] = settings.marklogicHost;
          configJSON['ml-admin-user'] = settings.marklogicAdminUser;
          configJSON['ml-admin-pass'] = settings.marklogicAdminPass;
          configJSON['ml-app-user'] = appUserName || (settings.nameDashed + '-user');
          configJSON['ml-app-pass'] = appUserPass || '';
          configJSON['ml-http-port'] = settings.appPort;

          if (settings.mlVersion < 8) {
            configJSON['ml-xcc-port'] = settings.xccPort;
          }

          configJSON['node-port'] = settings.nodePort;
          configJSON['guest-access'] = settings.guestAccess;
          configJSON['disallow-updates'] = settings.disallowUpdates;
          configJSON['appusers-only'] = settings.appUsersOnly;

          var configString = JSON.stringify(configJSON, null, 2) + '\n';
          fs.writeFileSync(env + '.json', configString, encoding);
          log('Created ' + env + '.json.');

          if (fs.existsSync('deploy/' + env + '.properties')) {
            log('NOTE: deploy/' + env + '.properties already exists, change manually please!');
          } else {
            var envProperties = '#################################################################\n' +
              '# This file contains overrides to values in build.properties\n' +
              '# These only affect your local environment and should not be checked in\n' +
              '#################################################################\n' +
              '\n' +
              'server-version=' + settings.mlVersion + '\n' +
              '\n' +
              '#\n' +
              '# The ports used by your application\n' +
              '#\n' +
              'app-port=' + settings.appPort + '\n';
            if (settings.mlVersion < 8) {
              envProperties += 'xcc-port=' + settings.xccPort + '\n';
            } else {
              envProperties += '# Taking advantage of not needing a XCC Port for ML8\n' +
                'xcc-port=${app-port}\n' +
                'install-xcc=false\n';
            }

            envProperties += '\n' +
              '#\n' +
              '# the uris or IP addresses of your servers\n' +
              '# WARNING: if you are running these scripts on WINDOWS you may need to change localhost to 127.0.0.1\n' +
              '# There have been reported issues with dns resolution when localhost wasn\'t in the hosts file.\n' +
              '#\n' +
              env + '-server=' + settings.marklogicHost + '\n' +
              'content-forests-per-host=3\n' +
              '\n' +
              '#\n' +
              '# Admin username/password that will exist on the local/dev/prod servers\n' +
              '#\n' +
              'user=' + settings.marklogicAdminUser + '\n' +
              'password=' + settings.marklogicAdminPass + '\n';

            fs.writeFileSync('deploy/' + env + '.properties', envProperties, encoding);
            log('Created deploy/' + env + '.properties.');
          }
          done();
        } catch (e) {
          log('Failed to write ' + env + ' config files: ' + e.message);
          done();
        }
      });
    });
  }
}
// bypass Roxy bug that causes special XML chars to get escaped as entities
function unescape(s) {
  return s.replace('&apos;', '\'').replace('&quot;', '"').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('{{', '{').replace('}}', '}');
}

/**
 * Inject files in a sorted sequence at a specified inject label
 * @param   {Array} src   glob pattern for source files
 * @param   {String} label   The label name
 * @param   {Array} order   glob pattern for sort order of the files
 * @return  {Stream}
 */
function inject(src, label, order) {
  var options = {
    read: false
  };
  if (label) {
    options.name = 'inject:' + label;
  }

  return $.inject(orderSrc(src, order), options);
}

/**
 * Order a stream
 * @param   {Stream} src   The gulp.src stream
 * @param   {Array} order Glob array pattern
 * @return  {Stream} The ordered stream
 */
function orderSrc(src, order) {
  return gulp
    .src(src)
    .pipe($.if(order, $.order(order)));
}



/**
 * Formatter for bytediff to display the size changes after processing
 * @param  {Object} data - byte data
 * @return {String}    Difference in bytes, formatted
 */
function bytediffFormatter(data) {
  var difference = (data.savings > 0) ? ' smaller.' : ' larger.';
  return data.fileName + ' went from ' +
    (data.startSize / 1000).toFixed(2) + ' kB to ' +
    (data.endSize / 1000).toFixed(2) + ' kB and is ' +
    formatPercent(1 - data.percent, 2) + '%' + difference;
}

/**
 * Format a number as a percentage
 * @param  {Number} num     Number to format as a percent
 * @param  {Number} precision Precision of the decimal
 * @return {String}       Formatted perentage
 */
function formatPercent(num, precision) {
  return (num * 100).toFixed(precision);
}

/**
 * Log a message or series of messages using chalk's blue color.
 * Can pass in a string, object or array.
 */
function log(msg) {
  if (typeof(msg) === 'object') {
    for (var item in msg) {
      if (msg.hasOwnProperty(item)) {
        $.util.log($.util.colors.blue(msg[item]));
      }
    }
  } else {
    $.util.log($.util.colors.blue(msg));
  }
}

/**
 * Show OS level notification using node-notifier
 */
function notify(options) {
  var notifier = require('node-notifier');
  var notifyOptions = {
    sound: 'Bottle',
    contentImage: path.join(__dirname, 'gulp.png'),
    icon: path.join(__dirname, 'gulp.png')
  };
  _.assign(notifyOptions, options);
  notifier.notify(notifyOptions);
}

function run(cmd, args, verbose) {
  var d = q.defer();
  var output = '';

  console.log('Spawning ' + cmd + ' ' + args.join(' '));
  var child = spawn(cmd, args, {
    stdio: [
      0, // Use parents stdin for child
      'pipe', // Pipe child's stdout to parent (default)
      'pipe' // Pipe child's stderr to parent (default)
    ]
  });

  child.on('close', function() {
    console.log('done running ' + cmd);
    d.resolve(output);
  });

  child.stdout.on('data', function(chunk) {
    if (verbose) {
      console.log(chunk.toString());
    }
    output += chunk.toString();
  });

  child.stderr.on('data', function(data) {
    console.log(data.toString());
  });

  return d.promise;
}


module.exports = gulp;
