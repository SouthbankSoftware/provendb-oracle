BEGIN
  DBMS_SCHEDULER.create_job (
    job_name        => 'p4oRegularUpdate',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN Update contractstablefbda set mytimestamp=sysdate;commit; END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'freq=minutely; bysecond=0;',
    enabled         => TRUE);
END;
/
SELECT * FROM USER_JOBS;

SELECT * FROM USER_SCHEDULER_PROGRAMS

select max(mytimestamp) from contractstablefbda;

BEGIN DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified');commit; END; 

                    COMMIT;