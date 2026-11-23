import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'src/**/*', 'server/**/*', 'server.ts', '*.ts', '*.js', '!eslint.config.js'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
