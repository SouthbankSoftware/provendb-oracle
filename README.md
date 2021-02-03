proofable-oracle
================

Proofable Connector for Oracle

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/proofable-oracle.svg)](https://npmjs.org/package/proofable-oracle)
[![Downloads/week](https://img.shields.io/npm/dw/proofable-oracle.svg)](https://npmjs.org/package/proofable-oracle)
[![License](https://img.shields.io/npm/l/proofable-oracle.svg)](https://github.com/michaeljharrison/proofable-oracle/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g provendb-oracle
$ provendb-oracle COMMAND
running command...
$ provendb-oracle (-v|--version|version)
provendb-oracle/0.0.0 darwin-x64 node-v12.20.1
$ provendb-oracle --help [COMMAND]
USAGE
  $ provendb-oracle COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`provendb-oracle anchor`](#provendb-oracle-anchor)
* [`provendb-oracle autocomplete [SHELL]`](#provendb-oracle-autocomplete-shell)
* [`provendb-oracle help [COMMAND]`](#provendb-oracle-help-command)
* [`provendb-oracle history`](#provendb-oracle-history)
* [`provendb-oracle install`](#provendb-oracle-install)
* [`provendb-oracle monitor`](#provendb-oracle-monitor)
* [`provendb-oracle validate`](#provendb-oracle-validate)

## `provendb-oracle anchor`

Anchor one or more tables to the blockchain.

```
USAGE
  $ provendb-oracle anchor

OPTIONS
  -v, --verbose        increased logging verbosity
  --config=config      config file location
  --includeRowIds      Include proofs for every row in the proof file
  --includeScn         Include SCN into rowid signature (create historical proof)
  --tables=tables      (required) tables to anchor
  --validate=validate  Validate the proof and output to file
  --where=where        WHERE clause to filter rows

DESCRIPTION
  Anchor reads the current state of selected table, filtered by an options WHERE 
  clause.  Rows are hashed and anchored to the blockchain.
```

_See code: [src/commands/anchor.js](https://github.com/michaeljharrison/proofable-oracle/blob/v0.0.0/src/commands/anchor.js)_

## `provendb-oracle autocomplete [SHELL]`

display autocomplete installation instructions

```
USAGE
  $ provendb-oracle autocomplete [SHELL]

ARGUMENTS
  SHELL  shell type

OPTIONS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

EXAMPLES
  $ provendb-oracle autocomplete
  $ provendb-oracle autocomplete bash
  $ provendb-oracle autocomplete zsh
  $ provendb-oracle autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v0.2.0/src/commands/autocomplete/index.ts)_

## `provendb-oracle help [COMMAND]`

display help for provendb-oracle

```
USAGE
  $ provendb-oracle help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.0/src/commands/help.ts)_

## `provendb-oracle history`

List version history for a specific rows

```
USAGE
  $ provendb-oracle history

OPTIONS
  -v, --verbose    increased logging verbosity
  --config=config  config file location
  --rowid=rowid    row ID to fetch versions for
  --tables=tables  tablenames to search (username.tablename)
  --where=where    WHERE clause to filter rows

DESCRIPTION
  ...
  Show the rowids and optionally SCNs for which we have anchored proofs
```

_See code: [src/commands/history.js](https://github.com/michaeljharrison/proofable-oracle/blob/v0.0.0/src/commands/history.js)_

## `provendb-oracle install`

Installs the ProvenDB for Oracle users and tables

```
USAGE
  $ provendb-oracle install

OPTIONS
  -v, --verbose                        increased logging verbosity
  --config=config                      Create config file
  --createDemoAccount                  Create the ProofableDemo account
  --dropExisting                       Drop existing users if they exist
  --oracleConnect=oracleConnect        (required) Oracle connection String
  --provendbPassword=provendbPassword  (required) ProvenDB User Password
  --provendbUser=provendbUser          [default: provendb] ProvenDB User Name (defaut: provendb)
  --sysPassword=sysPassword            SYS Password
```

_See code: [src/commands/install.js](https://github.com/michaeljharrison/proofable-oracle/blob/v0.0.0/src/commands/install.js)_

## `provendb-oracle monitor`

Monitor the database for changes.

```
USAGE
  $ provendb-oracle monitor

OPTIONS
  -i, --interval=interval  [default: 120] polling interval
  -v, --verbose            increased logging verbosity
  --config=config          config file location
  --tables=tables          (required) tables to anchor

DESCRIPTION
  Monitor checks tables listed in the configuration file for changes.   
  Any changes to rows found will be anchored to the blockchain defined
  in the configuration file.
```

_See code: [src/commands/monitor.js](https://github.com/michaeljharrison/proofable-oracle/blob/v0.0.0/src/commands/monitor.js)_

## `provendb-oracle validate`

Validate Oracle data against a blockchain proof

```
USAGE
  $ provendb-oracle validate

OPTIONS
  -v, --verbose      increased logging verbosity
  --config=config    config file location
  --output=output    output file for proof
  --proofId=proofId  proofId to validate
  --rowId=rowId      row ID to validate

DESCRIPTION
  sValidate compares the data in the database (or in the flashback archive) to the 
  digital signature (hash value) that was created when the row was anchored.  It then
  confirms that the hashes match and that the hash is included in the blockchain anchor.

  Validate generates a proof file which contains the row data and anchor information.  This 
  proof file can serve as an independent proof of the data.
```

_See code: [src/commands/validate.js](https://github.com/michaeljharrison/proofable-oracle/blob/v0.0.0/src/commands/validate.js)_
<!-- commandsstop -->
