/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const {
    provendbOracle, getParameters
} = require('./testCommon');

const parameters = getParameters();
const demoSchema = parameters.config.oracleConnection.user.toUpperCase() + 'DEMO';

describe('provendb-oracle History tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbOracle('history --help');
        expect(output).toEqual(expect.stringMatching('Show the rowids and optionally SCNs for which we have anchored proofs'));
    });
    test('table history', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLE`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        console.log(lines.length);
        expect(lines.length > 5).toBeTruthy();
    });

    test('Rowid history', async () => {
        jest.setTimeout(120000);
        let output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLE`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);

        expect(lines.length > 5).toBeTruthy();

        const lastLine = lines[lines.length - 2];
        // expect(lastLine).toEqual(expect.stringMatching('Rowid'));
        const rowid = lastLine.match(/^(\S*)(.*)/)[1];
        expect(rowid.length).toEqual(18);
        output = await provendbOracle(`history --config=testConfig.yaml --rowid=${rowid}`);
        expect(output).toEqual(expect.stringMatching('Rowid'));
        expect(output).toEqual(expect.stringMatching(rowid));
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
        expect(output).not.toEqual(expect.stringMatching('No proofs'));
    });
});

 
