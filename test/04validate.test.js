/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */



const oracledb = require('oracledb');
const {
    provendbOracle,
    getParameters
} = require('./testCommon');

const parameters = getParameters();
const provendbUser = parameters.config.oracleConnection.user.toUpperCase();
const demoSchema = provendbUser + 'DEMO';



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

    test('Validate a simple ROWID', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLE`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);

        let rowId;
        const lastLine = lines[lines.length - 2];
        console.log(lastLine);
        const rowIdMatch = lastLine.match(/(\S+)(.*)/);
        if (rowIdMatch && rowIdMatch.length > 1) {
            rowId = rowIdMatch[1];
        } else {
            expect('Cannot find Rowid In output').to.equal(false);
        }

        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --rowId=${rowId}`);
        expect(vOutput).toEqual(expect.stringMatching('PASS: Rowid hash value confirmed as'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Validate a rowid SCN', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle(`history --config=testConfig.yaml --tables=${demoSchema}.CONTRACTSTABLEFBDA`);

        expect(output).toEqual(expect.stringMatching(`Table:  ${demoSchema}.CONTRACTSTABLE`));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        let rowidScn;
        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const lmatch = line.match(/^(\s+)([A-Za-z0-9\+\\]+\.[0-9]+)(\s+)(.*)/);
            if (lmatch) {
                rowidScn = lmatch[2];
                break;
            }
        }
        console.log('rowIdScn',rowidScn);
        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --rowId=${rowidScn}`);
        expect(vOutput).toEqual(expect.stringMatching('PASS: blockchain hash matches proof hash'));
        expect(vOutput).toEqual(expect.stringMatching('PASS: Proof validated with hash'));
        expect(vOutput).toEqual(expect.stringMatching('PASS: Rowid hash value confirmed as'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
        expect(vOutput).not.toEqual(expect.stringMatching('FAIL'));
    });
    // x.match(/^([A-Za-z0-9+/]*)(\s*)(\S*)(\s*)([A-Za-z0-9+\./]*)(\s*)(\S*)(\s*)(\S*)$/)

    test('Validate an entire Proof', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('history --config=testConfig.yaml --proofOnly');


        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        let proofId;
        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const lmatch = line.match(/(.*)Proof:(\s+)(.*)(\s+)(AdHoc)(.*)/);
            if (lmatch) {
                proofId = lmatch[3];
            }
        }
        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --proofId=${proofId}`);
        expect(vOutput).toEqual(expect.stringMatching('PASS'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
    });

    test('Validate all Proofs', async () => {
        jest.setTimeout(120000);
        console.log(provendbUser);
        const oraConnection = await oracledb.getConnection({
            connectString: parameters.P4O_ORACLE_SERVER,
            user: provendbUser,
            password: 'myLongPassword23'
        });
        const result = await oraConnection.execute('select proofid from PROVENDBCONTROL');
        let output;
        for (let rown = 0; rown < result.rows.length; rown++) {
            const row = result.rows[rown];
            const proofId = row[0];
            output += await provendbOracle(`validate --config=testConfig.yaml --proofId=${proofId}`);
        }
        expect(output).not.toEqual(expect.stringMatching('ERROR'));
    });
});
