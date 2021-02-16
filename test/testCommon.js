const {
  promisify
} = require('util');
const fs = require('fs');
const yaml = require('js-yaml');

const exec = promisify(require('child_process').exec);

export async function provendbOracle(args) {
  const input = 'provendb-oracle ' + args + ' 2>&1|cut -c -1000';

  fs.appendFileSync('provendbOracle.test.log', '\n-------------------\n' + input + '\n-------------------\n');
  let output;
  let cmdout;
  try {
    cmdout = await exec(input);
    output = cmdout.stdout;
  } catch (error) {
    console.log(error.stack);
  }
  fs.appendFileSync('provendbOracle.test.log', output);
  return output;
}

export function getParameters() {
  const output = {
    P4O_ORACLE_SERVER: 'testdb',
    P4O_ORACLE_USERNAME: 'system',
    P4O_ORACLE_PASSWORD: 'oracle'
  };

  const parameters = ['P4O_ORACLE_SERVER', 'P4O_ORACLE_USERNAME', 'P4O_ORACLE_PASSWORD'];
  for (let i = 0; i < parameters.length; i++) {
    const parameter = parameters[i];
    if (parameter in process.env) {
      output[parameter] = process.env[parameter];
    }
  }
  let config={};
  try {
   config = yaml.safeLoad(fs.readFileSync('testConfig.yaml', 'utf8'));
  } catch(error) {
    console.log(error.message);
  }
  output.config = config;

  return output;
}
