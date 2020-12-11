UPDATE contractsTable SET mytimestamp=sysdate WHERE ROWNUM<10;
COMMIT;

SELECT c.rowid,c.*, versions_starttime, versions_endtime, versions_operation 
  from contractsTable version as of sysdate-3 c 
  where contractid=1;



SELECT table_name, to_char(start_time,'dd/mm/yy:hh24:mi:ss') start_,
       to_char(end_time,'dd/mm/yy:hh24:mi:ss') end_,trieid,length(trie) 
    FROM proofablecontrol
  ORDER BY start_time DESC; 

SELECT trieid,owner_name,table_name
        FROM proofablecontrolrowids JOIN proofablecontrol USING(trieid) 
        WHERE rowid_starttime = 'AAASOYAABAAAcsKAAI.1602153145000';

SELECT rowid, c.* FROM contractsTable c 
ORDER BY mytimestamp DESC;

select * from dual;

mp from effective_date)
        ORDER BY versions_starttime;