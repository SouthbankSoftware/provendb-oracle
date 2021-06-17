

DROP TABLE provendbdemo.bigtable;

CREATE TABLE provendbdemo.bigtable AS 
SELECT LEVEL id,CEIL(DBMS_RANDOM.VALUE(0, 10000)) ndata,DBMS_RANDOM.STRING('a',100) sdata ,TRUNC(SYSDATE) -365 + DBMS_RANDOM.value(0,366) ddata 
  FROM dual entry 
  CONNECT BY LEVEL<1000000;
 
INSERT INTO provendbdemo.bigtable SELECT * FROM provendbdemo.bigtable;
INSERT INTO provendbdemo.bigtable SELECT * FROM provendbdemo.bigtable;
INSERT INTO provendbdemo.bigtable SELECT * FROM provendbdemo.bigtable;
INSERT INTO provendbdemo.bigtable SELECT * FROM provendbdemo.bigtable;
COMMIT;
  
SELECT COUNT(*) FROM provendbdemo.bigtable;