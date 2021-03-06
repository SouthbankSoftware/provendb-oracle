/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */


const oracledb = require('oracledb');
const {
    provendbOracle, getParameters
} = require('./testCommon');

const parameters = getParameters();
const demoSchema = parameters.config.oracleConnection.user.toUpperCase() + 'DEMO';
const demoPassword = 'myLong_Password_23';



describe('provendb-oracle Monitor tests', () => {
    beforeAll(() => { });

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => { });

    test('Test help', async () => {
        const output = await provendbOracle('monitor --help');
        expect(output).toEqual(expect.stringMatching('Monitor the database for changes'));
    });
    test('Test monitor', async () => {
        jest.setTimeout(120000);
        const monitorCmd = `monitor --config=testConfig.yaml -i 20 -m 40 --tables=${demoSchema}.CONTRACTSTABLE ${demoSchema}.CONTRACTSTABLEFBDA`;
        const output = await provendbOracle(monitorCmd);
        expect(output).toEqual(expect.stringMatching('Anchoring data to HEDERA'));
        expect(output).toEqual(expect.stringMatching('Anchored to https'));
        expect(output).toEqual(expect.stringMatching('Sleeping for 20 seconds'));
        expect(output).toEqual(expect.stringMatching('100 keys'));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });
});
