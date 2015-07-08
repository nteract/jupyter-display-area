var gulp = require('gulp'),
  es6ify = require('es6ify'),
  $ = require('gulp-load-plugins')();

gulp.task('js', function () {
  gulp.src([
    'src/jupyter-display-area.js',
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
  gulp.src('src/jupyter-display-area.html')
    .pipe($.rename('jupyter-display-area.local.html'))
    .pipe(gulp.dest('dist'));
});

gulp.task('vulcanize', function () {
  gulp.src('dist/jupyter-display-area.local.html')
    .pipe($.vulcanize({dest: 'dist', inline: true}))
    .pipe($.rename('jupyter-display-area.html'))
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
  gulp.watch(['dist/jupyter-display-area.local.html', 'dist/jupyter-display-area.js', 'dist/jupyter-display-area.css'], ['vulcanize']);

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
