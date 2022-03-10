const gulp = require('gulp');

const child = require('child_process');
const fs = require('fs');
const rimraf = require('rimraf-promise');
const mkdirp = require('mkdirp');
const replace = require('replace');

const rollup = require('rollup-stream');
const source = require('vinyl-source-stream');
const commonjs = require('@rollup/plugin-commonjs');

const libphonenumberVersion = fs.readFileSync('libphonenumber.version', 'utf8').toString().trim();

const rootDir = '.';
const buildRoot = `${rootDir}/build`;
const libphonenumberUrl = 'https://github.com/google/libphonenumber/';
const closureLinterUrl = 'https://github.com/google/closure-linter';
const pythonGflagsUrl = 'https://github.com/google/python-gflags.git';
const antName = 'apache-ant-1.10.11';
const antTar = `${antName}.tar.gz`;
const antUrl = `http://apache.mirrors.spacedump.net/ant/binaries/${antName}-bin.tar.gz`;

const isDebug = process.env.DEBUG && process.env.DEBUG !== '0';

gulp.task('clean', () => rimraf(buildRoot));

gulp.task('make-build-dir', async () => await mkdirp(buildRoot));

gulp.task(
  'clone-libphonenumber',
  gulp.series('make-build-dir', () =>
    gitClone(libphonenumberUrl, 'libphonenumber', libphonenumberVersion),
  ),
);

gulp.task(
  'checkout-closure-linter',
  gulp.series('make-build-dir', () => gitClone(closureLinterUrl, 'closure-linter')),
);

gulp.task(
  'checkout-python-gflags',
  gulp.series('make-build-dir', () => gitClone(pythonGflagsUrl, 'python-gflags')),
);

gulp.task(
  'download-ant',
  gulp.series(
    'make-build-dir',
    () => runCommand('curl', ['-L', '-o', antTar, antUrl], { cwd: buildRoot }),
    () => runCommand('tar', ['zxf', antTar], { cwd: buildRoot }),
  ),
);

gulp.task(
  'download-deps',
  gulp.parallel(
    'clone-libphonenumber',
    'checkout-closure-linter',
    'checkout-python-gflags',
    'download-ant',
  ),
);

gulp.task('build-deps', gulp.series('download-deps'));

gulp.task('build-libphonenumber', () => runCommand(`${rootDir}/build.sh`, [], { cwd: rootDir }));

gulp.task('build-esm-version', () => {
  return (
    rollup({
      input: './index.js',
      output: {
        file: './index-esm.js',
        format: 'es',
        exports: 'default',
      },
      plugins: [commonjs()],
    })
      // give the file the name you want to output with.
      .pipe(source('index-esm.js'))
      // and output to ./dist/app.js as normal.
      .pipe(gulp.dest('./'))
  );
});

gulp.task('build', gulp.series('build-deps', 'build-libphonenumber', 'build-esm-version'));

gulp.task('update-readme', () => updateReadme());

gulp.task('default', gulp.series('clean', 'build', 'update-readme'));

async function updateReadme() {
  replace({
    regex: 'Uses libphonenumber ([A-Za-z.0-9]+)',
    replacement: `Uses libphonenumber ${libphonenumberVersion}`,
    paths: ['README.md'],
    silent: true,
  });
}

function gitClone(url, name, branch) {
  const args = ['--depth=1'];
  if (branch) args.push('--branch=' + branch);

  return runCommand('git', ['clone', ...args, url, name]);
}

function runCommand(cmd, args, opts) {
  opts = opts || {
    cwd: './build',
    stdio: [null, null, isDebug ? process.stderr : null],
  };

  return new Promise(function (resolve, reject) {
    var cp = child.spawn(cmd, args, opts);
    cp.stdout.on('data', (data) => {
      if (isDebug) console.log(data.toString());
    });
    cp.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited with exitcode ${code}. Args: ${args}`));
    });
    cp.on('error', (err) => reject(err));
  });
}
