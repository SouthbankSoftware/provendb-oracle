/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 **/
/* eslint unicorn/filename-case:off */

const {
    promisify
} = require('util');
const exec = promisify(require('child_process').exec);

describe('provendb-oracle Anchor tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        let output = await provendbOracle('anchor --help');
        expect(output).toEqual(expect.stringMatching('Anchor one or more tables to the blockchain'));
    });
});

async function provendbOracle(args) {
    const input = 'provendb-oracle ' + args + ' 2>&1|cut -c -1000';
    console.log(input);
    let output;
    let cmdout;
    try {
        cmdout = await exec(input);
        output = cmdout.stdout;
    } catch (error) {
        console.log(error.stack);
    }
    return output;
}