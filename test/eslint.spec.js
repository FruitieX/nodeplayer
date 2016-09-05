const lint = require('mocha-eslint');

const paths = [
  'bin',
  'src',
  'test',
];

lint(paths);
