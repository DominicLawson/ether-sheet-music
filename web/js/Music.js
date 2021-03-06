/**
 * Music contract helper
 *
 * @requires [ Web3 ]
 *
 */
"use strict";

EM.Music = function() {

    var scope = this;

    scope.blockSearch = {
        fromBlock: "latest"
    };

    scope.lastSharp = {};

    var NET_NOTES = NOTES[ NETWORK ];

    scope.notesLoaded = typeof( NET_NOTES[ 1 ] ) !== "undefined" ? NET_NOTES : null;

    scope.globalStats = GLOBAL_STATS[ NETWORK ] || null;


    /**
     * Main note creator
     */

    scope.createBeat = function( donation, notes, dividers, noteLengths ) {

        var trans = {
            value: web3.toWei( donation, "ether" )
        };

        function callback( err, response ) {

            if( err ) {

                throw err;

            }

            scope.dispatch({
                type: "user-note-created",
                data: response
            });

        }

        if( dividers.length === 1 ) {

            instance.createBeat( notes, noteLengths[ 0 ], trans, callback );

        } else {

            instance.createPassage( notes, dividers, noteLengths, trans, callback );

        }

    }


    /**
     * Get stats helper
     */

    scope.getStats = function( callback ) {

        if( scope.globalStats ) {

            callback( scope.globalStats );
            return;

        }

        instance.getDonationStats( function( err, stats ) {

            scope.globalStats = {
                goal: web3.fromWei( stats[ 0 ].toNumber(), "ether" ),
                min: web3.fromWei( stats[ 1 ].toNumber(), "ether" ),
                current: parseFloat( web3.fromWei( stats[ 2 ].toNumber(), "ether" ) )
            };

            callback( scope.globalStats );

        });

    };


    /**
     * Load from cache or from web3 grabs
     */

    scope.setupComposers = function( callback ) {

        //Not from cache

        if( ! scope.notesLoaded ) {

            scope.notesLoaded = {};

            scope.getComposerStats( callback );

            return;

        }

        for( var noteId in scope.notesLoaded ) {

            var note = scope.notesLoaded[ noteId ];

            var noteData = scope.formatNote( noteId, note );

            scope.notesLoaded[ noteId ] = noteData;

        }

        callback( scope.notesLoaded );

    };


    /**
     * Composer stats
     */

    scope.getComposerStats = function( callback ) {

        instance.getNumberOfBeats( function( err, numNotes ) {

            var id = 1;

            var stats = [];

            var numNotes = numNotes.toNumber();

            async.eachSeries( new Array( numNotes ), function( item, itemCallback ) {

                scope.getBeat( id, function( composer ) {

                    stats.push( composer );

                    ++ id;

                    itemCallback();

                });

            }, function() {

                callback && callback( stats );

            });

        });

    };


    /**
     * Main get note
     */

    scope.getBeat = function( noteId, callback ) {

        if( scope.notesLoaded[ noteId ] ) {

            callback( scope.notesLoaded[ noteId ] );

        }

        instance.getBeat( noteId, function( err, note ) {

            var noteData = scope.formatNote( noteId, note );

            scope.notesLoaded[ noteId ] = noteData;

            callback( noteData );

        });

    };


    /**
     * EVM listeners
     */

    scope.setupListeners = function() {

        var createEvent = instance.NoteCreated( {}, scope.blockSearch );

        createEvent.watch( function( err, note ) {

            note = note.args;

            var id = note.id.toNumber();


            //Already loaded

            if( scope.notesLoaded[ id ] ) {

                return;

            }

            var donation = parseFloat( web3.fromWei( note.donation.toNumber(), "ether" ) );

            scope.globalStats.current += donation;

            scope.dispatch({
                type: "note-created",
                data: {
                    maker: note.maker,
                    id: id,
                    donation: donation
                }
            });

        });

    };


    /**
     * Format note for UI
     */

    scope.formatNote = function( noteId, note ) {

        var midi = EM.Shim.arrayUnique( note[ 1 ] );
        var length = note[ 2 ] | 0;

        var midiABC = scope.convertMidiToABC( midi, length );
        var lengthABC = Midi.ABC.NoteLength[ length ];

        var noteData = {
            id: noteId,
            maker: note[ 0 ],
            midi: midi,
            abc: {
                note: midiABC,
            },
            length: length,
            lengthName: Midi.NoteLength[ length ],
            donation: EM.Shim.fromWei( note[ 3 ] )
        };

        return noteData;

    };

    /**
     * Conversion to midi / sheet music plugins
     */

    scope.convertMidiToABC = function( midiNotes, length ) {

        var abc = scope.convertMidisToABCChord( midiNotes );

        var lengthABC = Midi.ABC.NoteLength[ length ];

        abc = abc + lengthABC;

        return abc;

    };

    scope.convertMidisToABCChord = function( midiNotes ) {

        var out = [];

        var ml = midiNotes.length;

        if( ml === 0 ) {

            return "z";

        }

        for( var i = 0; i < ml; ++ i ) {

            midiNotes[ i ] = midiNotes[ i ] | 0;

        }

        for( var i = 0; i < ml; ++ i ) {

            var note = midiNotes[ i ];

            var abc = scope.convertMidiToABCNote( note, midiNotes );

            out.push( abc );

        }

        return "[" + out.join( "" ) + "]";

    }

    scope.convertMidiToABCNote = function( midi, fromChord ) {

        var midiName = Midi.NoteNumber[ midi ];
        midiName = midiName.midi;

        var midiLetter = midiName.replace( /(\w)\#?(\d+)/, "\$1" );
        var midiNumber = midiName.replace( /.*?(\d+)/, "\$1" ) | 0;
        var sharp = midiName.indexOf( "#" ) !== -1;

        var abc = midiLetter;

        //Uppercase if over middle 4
        var lowerCase = midiNumber > 4;
        var appendage;

        if( lowerCase ) {

            abc = abc.toLowerCase();
            appendage = EM.Shim.repeat( "'", midiNumber - 5 );

        } else {

            appendage = EM.Shim.repeat( ",", Math.abs( midiNumber - 4 ) );

        }

        abc += appendage;

        if( sharp ) {

            abc = "^" + abc;

        } else {

            //Natural note explicit

            var nextMidiNum = midi + 1;
            var nextMidi = Midi.NoteNumber[ nextMidiNum ];

            //Check if played prior

            if( nextMidi ) {

                var nextMidiName = nextMidi.midi.replace( /(\w)\#?(\d+)/, "\$1" );

                if( nextMidiName === midiLetter && !! scope.lastSharp[ nextMidiNum ] ) {

                    scope.lastSharp[ nextMidiNum ] = false;
                    abc = "=" + abc;

                }

                //Check if sharp in chord

                else if ( fromChord.indexOf( nextMidi ) !== -1 ) {

                    abc = "=" + abc;

                }

            }

        }

        scope.lastSharp[ midi ] = true;

        return abc;

    };


    /**
     * Convert array to ABC
     */

    scope.convertArrayToABC = function( arr ) {

        var al = arr.length;

        var output = "";

        for( var i = 0; i < al; ++ i ) {

            var beat = arr[ i ];

            output += scope.convertMidiToABC( beat.notes, beat.length );

        }

        return output;

    };


    /**
     * Network helpers
     */

    scope.getNetworkEtherscan = function() {

        var net = NETWORK;

        if( net === "1" ) {

            return "";

        }

        if( Networks[ net ] ) {

            return Networks[ net ] + ".";

        }

        //console.warn( "No etherscan for network " + net );

        return "";

    };


    /**
     * etherscan url grabber
     */

    scope.getTransactionUrl = function( txHash ) {

        var network = scope.getNetworkEtherscan();

        var url = "https://" + network + "etherscan.io/tx/" + txHash;

        return url;

    };

};


EventDispatcher.prototype.apply( EM.Music.prototype );
