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



describe('provendb-oracle Anchor tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbOracle('validate --help');
        expect(output).toEqual(expect.stringMatching('Validate Oracle data against a blockchain proof'));
    });

    test('Validate a rowid SCN', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLEFBDA`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLEFBDA`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        let rowidScn;
        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const lmatch = line.match(/^([A-Za-z0-9/]+)(\s+)(\S+)(\s+)([A-Za-z0-9/]+.[0-9]+)(\s+)(\S+)(\s+)(\S+)$/);
            if (lmatch) {
                rowidScn = lmatch[5];
                break;
            }
        }
        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --rowId=${rowidScn}`);
        expect(vOutput).toEqual(expect.stringMatching('Rowid validation passed'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
    });
    // x.match(/^([A-Za-z0-9+/]*)(\s*)(\S*)(\s*)([A-Za-z0-9+\./]*)(\s*)(\S*)(\s*)(\S*)$/)

    test('Validate an entire Proof', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLEFBDA`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLEFBDA`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        let proofId;
        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const lmatch = line.match(/^([A-Za-z0-9/]+)(\s+)(\S+)(\s+)([A-Za-z0-9/]+)(\s+)(\S+)(\s+)(\S+)$/);
            if (lmatch) {
                proofId = lmatch[3];
                break;
            }
        }
        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --proofId=${proofId}`);
        expect(vOutput).toEqual(expect.stringMatching('All keys validated'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Validate all Proofs', async () => {
        jest.setTimeout(120000);
        const oraConnection = await oracledb.getConnection({
            connectString: 'testdb',
            user: 'provendbtest',
            password: 'DBEnvy2016'
        });
        const result = await oraConnection.execute('select trieid from PROOFABLECONTROL');
        let output;
        for (let rown = 0; rown < result.rows.length; rown++) {
            const row = result.rows[rown];
            const proofId = row[0];
             output += await provendbOracle(`validate --config=testConfig.yaml --proofId=${proofId}`);
        }
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });
});
