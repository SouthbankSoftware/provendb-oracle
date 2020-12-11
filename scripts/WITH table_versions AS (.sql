WITH table_versions AS (
        SELECT rowidtochar(C.ROWID) as row_rowid,C.*,
                versions_startscn, versions_starttime, versions_operation
        FROM P4ODEMO.CONTRACTSTABLEFBDA VERSIONS BETWEEN SCN
        :startscn
        AND :currentscn C WHERE versions_startscn>=:startscn )
    SELECT * from table_versions undefined
    ORDER BY versions_startscn