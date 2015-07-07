var gulp = require('gulp'),
  es6ify = require('es6ify'),
  $ = require('gulp-load-plugins')();

gulp.task('js', function () {
  gulp.src([
    'src/output-area.js',
  ])
    .pipe($.plumber())
    .pipe($.browserify({
      add: [ es6ify.runtime ],
      transform: ['es6ify']
    }))
    .pipe($.uglify())
    .pipe(gulp.dest('dist'));
});

gulp.task('html', function () {
  gulp.src('src/output-area.html')
    .pipe($.rename('output-area.local.html'))
    .pipe(gulp.dest('dist'));
});

gulp.task('vulcanize', function () {
  gulp.src('dist/output-area.local.html')
    .pipe($.vulcanize({dest: 'dist', inline: true}))
    .pipe($.rename('output-area.html'))
    .pipe(gulp.dest('dist'));
});

gulp.task('copy', function () {
  gulp.src([ // not just yet
  ])
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['js', 'html', 'copy', 'vulcanize']);

gulp.task('default', ['build', 'connect'], function () {
  gulp.watch(['src/*.*js'], ['js']);
  gulp.watch(['src/*.html'], ['html']);
  gulp.watch(['bower_components'], ['copy']);
  gulp.watch(['dist/output-area.local.html', 'dist/output-area.js', 'dist/output-area.css'], ['vulcanize']);

  gulp.watch(['index.html', 'dist/**.*', 'demos/**.*'], function (event) {
    return gulp.src(event.path)
      .pipe($.connect.reload());
  });
});

gulp.task('connect', function () {
  $.connect.server({
    root: [__dirname],
    port: 1983,
    livereload: {port: 2983}
  });
});
