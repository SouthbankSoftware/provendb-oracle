
DROP TABLE proofablecontrolrowids;
DROP TABLE proofablecontrol;


DELETE FROM proofablecontrolrowids;
DELETE FROM proofablecontrol;
COMMIT; 

 

CREATE TABLE proofablecontrol (
    owner_name   VARCHAR2(128) NOT NULL,
    table_name   VARCHAR2(128) NOT NULL,
    start_time   DATE NOT NULL,
    end_time     DATE NOT NULL,
    trieid       VARCHAR2(256),
    trie         CLOB NOT NULL,
    CONSTRAINT table1_pk PRIMARY KEY ( trieid )
        USING INDEX (
            CREATE UNIQUE INDEX table1_pk ON
                proofablecontrol (
                    trieid
                ASC )
        )
    ENABLE
);

CREATE INDEX proofablecontrol_i1 ON
    proofablecontrol (
        owner_name,
        table_name,
        start_time,
        end_time
    );

CREATE TABLE proofablecontrolrowids (
    trieid            VARCHAR2(256) NOT NULL,
    rowid_starttime   VARCHAR2(128) NOT NULL,
    versions_starttime timestamp not null,
    CONSTRAINT proofablecontrolrowids_pk PRIMARY KEY ( trieid,
                                                       rowid_starttime ) ENABLE
);

ALTER TABLE proofablecontrolrowids
    ADD CONSTRAINT proofablecontrolrowids_fk1 FOREIGN KEY ( trieid )
        REFERENCES proofablecontrol ( trieid )
    ENABLE;

CREATE INDEX proofablecontrolrowids_i1 on proofablecontrolrowids(rowid_starttime);

DROP flashback archive proofable; 

CREATE flashback archive proofable tablespace users retention 1 month;

ALTER flashback archive proofable purge all;

ALTER table contractsTable no flashback archive;

DROP TABLE contractsTable PURGE;

CREATE TABLE contractsTable(
  contractId   NUMBER PRIMARY KEY,
  metaData     VARCHAR2(4000)
     CHECK (metaData IS JSON),
  contractData VARCHAR2(4000) NOT NULL,
  mytimestamp TIMESTAMP
);

CREATE OR REPLACE TRIGGER contractsTable_proofable_trg 
    AFTER INSERT OR UPDATE OR DELETE ON contractsTable
    BEGIN 
      DBMS_ALERT.SIGNAL('provendb_alert','proofable table modified'); 
    END;
/

ALTER table contractsTable flashback archive proofable;

DROP SEQUENCE contract_seq;
CREATE SEQUENCE contract_seq; 

CREATE OR REPLACE PROCEDURE populatecontractsTable(n NUMBER) IS
  counter INTEGER:=0;
BEGIN
  WHILE counter < n LOOP
    INSERT INTO contractsTable(contractId,metaData,contractData,mytimestamp)
    values( contract_seq.nextval,'{"name":"A Name","Date":"A Date"}','jdfksljfdskfsdioweljdslfsdjlewowefsdfjl',sysdate);
    counter:=counter+1;
  END LOOP;
  COMMIT;
END; 
/

BEGIN
  populatecontractsTable(100);
END;
/
COMMIT;