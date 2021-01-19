const {
  promisify
} = require('util');
const fs = require('fs');

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
