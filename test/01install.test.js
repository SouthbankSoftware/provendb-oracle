/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const {
    promisify
} = require('util');
const exec = promisify(require('child_process').exec);

const debug = false;

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
    test('Install unitTest', async () => {
        jest.setTimeout(120000);
        const installCmd = 'install --config=testConfig.yaml --createDemoAccount --dropExisting --oracleConnect=testDb \
      --provendbPassword=DBEnvy2016 --provendbUser=provendbtest --sysPassword=oracle';
        const output = await provendbOracle(installCmd);
        expect(output).toEqual(expect.stringMatching('INFO  Connected to SYS'));
        expect(output).toEqual(expect.stringMatching('INFO  Install complete'));
        expect(output).toEqual(expect.stringMatching('INFO  Wrote new config'));
        await sleep(1000);
    });
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    if (debug) console.log(output);
    return output;
}
