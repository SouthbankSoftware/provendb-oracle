variable tablename char
variable tableowner char 

begin :tablename:='CONTRACTSTABLE';:tableowner:='PROOFABLEDEMO'; end;
/
        WITH effective_date AS (
                SELECT NVL(greatest((
                    SELECT last_purge_time  
                        FROM dba_flashback_archive    fa
                        JOIN dba_flashback_archive_tables   fat 
                    USING(flashback_archive_name)
                    WHERE fat.owner_name = :tableOwner
                        AND fat.table_name = :tableName ),
                (   SELECT CAST(nvl(MAX(end_time), 
                                sysdate -(1000 * 365)) AS TIMESTAMP)
                        FROM  proofablecontrol
                    WHERE  owner_name = :tableOwner
                        AND table_name = :tableName )) , 
                             CAST(SYSDATE AS TIMESTAMP))
                        effective_timestamp
                FROM dual),
        table_versions AS (
                SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                        versions_starttime, versions_operation 
                FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN TIMESTAMP    
                        (select effective_timestamp  from effective_date)
                AND sysdate C)
        SELECT * from table_versions 
        WHERE versions_starttime>(
            select effective_timestamp from effective_date)
        ORDER BY versions_starttime ;


        WITH table_versions AS (
                SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                        NVL(versions_starttime,SYSDATE) versions_starttime, versions_operation 
                FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN SCN    
                          16749468337727
                AND 16749468928162 C)
        SELECT * from table_versions where contractid=78
        ORDER BY versions_starttime    ;



        WITH table_versions AS (
                SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                       null  versions_startscn, null versions_starttime, null versions_operation 
                FROM PROOFABLEDEMO.CONTRACTSTABLE AS OF SCN    
                          16749468337726 C)
        SELECT * from table_versions  
        ORDER BY versions_starttime    ;

        WITH table_versions AS (
                SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                        versions_startscn, versions_starttime, versions_operation 
                FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN SCN    
                          16749468337727
                AND 16749468928162 C WHERE versions_startscn>=16749468337727)
        SELECT * from table_versions         
        ORDER BY versions_startscn    ;


WITH startime AS (SELECT CAST(SYSDATE-.0001 AS TIMESTAMP) x FROM DUAL )
SELECT * FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN TIMESTAMP (SELECT x FROM startime) and SYSDATE;


SELECT CAST( to_date('26/1015:20','DD/MM HH24:MI') AS TIMESTAMP) from dual;

SELECT * FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN TIMESTAMP CAST( to_date('26/10 15:20','DD/MM HH24:MI') AS TIMESTAMP)  and sysdate;


SELECT * FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN TIMESTAMP CAST(  (sysdate - interval '10' minute) AS TIMESTAMP)  and sysdate;

select * from v$parameter;

        WITH table_versions AS (
            SELECT rowidtochar(C.ROWID) as row_rowid,C.*, 
                    NVL(versions_starttime,SYSDATE) versions_starttime, 
                    versions_operation ,versions_startscn
            FROM PROOFABLEDEMO.CONTRACTSTABLE VERSIONS BETWEEN SCN 16749757117078                     
            AND 16749757117078 C)
        SELECT * from table_versions 
        ORDER BY versions_starttime  

col start_scn format 99999999999999999999999
col end_scn format 99999999999999999999999
col trieid format a26

SELECT  trieid, start_scn,Count(*) 
  FROM proofablecontrol join proofablecontrolrowids using (trieid)
group by trieid, start_scn

    BEGIN 
      DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
    END;
/
COMMIT;

CREATE OR REPLACE TRIGGER contractsTable_proofable_trg 
    AFTER INSERT OR UPDATE OR DELETE ON contractsTable
    BEGIN 
      SYS.DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
    END;
/

begin
        for i in 1..1000 loop 
        update contractstable set mytimestamp=sysdate ;
        commit;
        dbms_session.sleep(5);
        end loop;
end; 
/
show errors