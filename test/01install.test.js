/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const {
    provendbOracle
} = require('./testCommon');

const fs = require('fs');
const yaml = require('js-yaml');

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
        console.log(output);
        expect(output).toEqual(expect.stringMatching('INFO  Connected to SYS'));
        expect(output).toEqual(expect.stringMatching('INFO  Install complete'));
        expect(output).toEqual(expect.stringMatching('INFO  Wrote new config'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        await sleep(1000);
        try {
            const config = yaml.load(fs.readFileSync('testConfig.yaml'));
            config.anchorType = 'HEDERA';
            config.oracleTables = ['PROVENDBTESTDEMO.CONTRACTSTABLE', 'PROVENDBTESTDEMO.CONTRACTSTABLEFBDA'];
            config.proofable.token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDU3NDQ1NDUsImp0aSI6IjBRUHhBSG9XQzl1Y0ZNSjlBMUVjWFBJZUpTTlpmME84T3hDWjhkNWlTYzQ9Iiwic3ViIjoidTQ0eGl0dXhjbHZkdXRrNzg0aDI3cTlqIn0.TJUqKzHz-r-AxQcwF3ib810BVmkLTDLSfxNWVMPC2zE';
            config.proofable.endpoint = 'api.dev.proofable.io:443';
            const newConfig = yaml.safeDump(config);
            fs.writeFileSync('testConfig.yaml', newConfig);
          } catch (e) {
            expect(e.message).toEqual('');
          }
    });
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

 
