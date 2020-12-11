const results = await oraConnection.execute(
            'SELECT rowid_scn FROM proofablecontrolrowids WHERE trieid=:1',
            [trieId], {
                resultSet: true
            }
        );
        const rowBatch = 100;
        let rows = await results.resultSet.getRows(rowBatch);
        while (rows.length) {

            for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri];
              
            }
            rows = await results.resultSet.getRows(rowBatch);
        }
        await results.resultSet.close();