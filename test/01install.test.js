/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */


const fs = require('fs');
const yaml = require('js-yaml');
const {
    provendbOracle, getParameters
} = require('./testCommon');
const execSync = require('child_process').execSync;

const parameters = getParameters();
const debug = false;

const prdAnchorKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhbmNob3IiLCJleHAiOjE3ODA0NDIyNzEsImp0aSI6ImF2bDc1MHlucmx1cmo3ajZjOHR1bTQxeiIsInN1YiI6InV2cHgzYjVjNXV2bXduOTRxYTd2NG5kciIsInNjb3BlIjoiMCIsInJvbGUiOiJQYWlkIn0.mUQnGKOqzcS5IqXeSAGJ6H2DY2f_bL1IaeKzKz7D4K0';
 
describe('provendb-oracle Anchor tests', () => {
    beforeAll(() => { });

    beforeEach(() => { });

    afterEach(() => { });

    afterAll(() => { });

    test('Test help', async () => {
        const output = await provendbOracle('anchor --help');
        expect(output).toEqual(expect.stringMatching('Anchor one or more tables to the blockchain'));
    });

    test('Install unitTest', async () => {
        jest.setTimeout(120000);
        try {
            execSync('rm testConfig.yaml');
        } catch (error) {
            console.log(error.message);
        }
        const provendbUser = 'provendbTest' + Math.round(Math.random() * 10000);

        let installCmd = `install --config=testConfig.yaml --createDemoAccount --dropExisting \
            --oracleConnect=${parameters.P4O_ORACLE_SERVER} \
            --provendbPassword=myLongPassword23 --provendbUser=${provendbUser}`;
        if (parameters.P4O_ORACLE_USERNAME.toLowerCase() === 'sys') {
            installCmd += ` --sysPassword=${parameters.P4O_ORACLE_PASSWORD}`;
        } else {
            installCmd += ` --dbaUserName=${parameters.P4O_ORACLE_USERNAME} --dbaPassword=${parameters.P4O_ORACLE_PASSWORD}`;
        }
        console.log(installCmd);
        const output = await provendbOracle(installCmd);
        console.log(output);
        expect(output).toEqual(expect.stringMatching('INFO  Install complete'));
        expect(output).toEqual(expect.stringMatching('INFO  Wrote new config'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        await sleep(1000);
        try {
            const config = yaml.load(fs.readFileSync('testConfig.yaml'));
            config.anchorType = 'HEDERA';
            config.proofable.token = prdAnchorKey;
            config.proofable.endpoint = 'api.proofable.io:443';
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


