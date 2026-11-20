import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', '.gmp_cache/**/*', 'node_modules/**/*', 'src/**/*', 'public/**/*', '*.ts', '*.js'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
