/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
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
        const output = await provendbOracle('anchor --help');
        expect(output).toEqual(expect.stringMatching('Anchor one or more tables to the blockchain'));
    });
    test('anchor table', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('anchor --config=testConfig.yaml --includeRowIds --includeScn --tables=PROVENDBTESTDEMO.CONTRACTSTABLE --validate=testProof.proof --where="CONTRACTID>0"');
        expect(output).toEqual(expect.stringMatching('Connected to Oracle'));
        expect(output).toEqual(expect.stringMatching('Anchoring proof: CONFIRMED'));
        expect(output).toEqual(expect.stringMatching('Proof written to testProof.proof'));
        expect(output).toEqual(expect.stringMatching('INFO  100 keys'));
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
