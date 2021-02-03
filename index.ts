import fastify, { FastifyInstance } from 'fastify'
import fastifyRawBody from 'fastify-raw-body'

// import json schemas as normal
import QuerystringSchema from './schemas/querystring.json'
import HeadersSchema from './schemas/headers.json'
import BodySchema from './schemas/body.json'

// import the generated interfaces
import { QuerystringSchema as QuerystringSchemaInterface } from './types/querystring'
import { HeadersSchema as HeadersSchemaInterface } from './types/headers'
import { BodySchema as BodySchemaInterface } from './types/body'

import * as crypto from "crypto";

enum Algorithm {
    sha256 = "sha256"
}
type Signal = "online" | "position" | "distance_covered" | "autonomy_percentage" | "autonomy_meters" | "*"
const signal_name = new Set<Signal>(["online", "position", "distance_covered", "autonomy_percentage", "autonomy_meters", "*"]);
let secret = "A secret of your choice"

function isSignal(signal: string): signal is Signal {
    return (signal_name.has(signal as Signal))
}

const generateSignature = (message: string, secret: string, algorithm: string): string => {
    if (!secret) {
        return "";
    }
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(message, "utf8");
    return `${algorithm}=${hmac.digest("hex")}`;
}

const server = fastify()


server.listen(8080, (err, address) => {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    console.log(`Server listening at ${address}`)
})

server.register(require('fastify-raw-body'), {
    field: 'rawBody',
    global: false,
    encoding: 'utf-8',
    runFirst: true
})

server.get<{
    Querystring: QuerystringSchemaInterface
}>('/listener', {
    schema: {
        querystring: QuerystringSchema
    },
    preValidation: (request, reply, done) => {
        const { 'hub.mode': mode, 'hub.topic': topic, 'hub.challenge': challenge } = request.query
        let splitted = topic.split(":");
        done((  
            // to be transformed in a function
            splitted.length !== 4 ||
            splitted[0] !== "vehicle" ||
            splitted[2] !== "generic" ||
            !isSignal(splitted[3]) ||
            !signal_name.has(splitted[3] as Signal ||
            mode !== 'subscribe')
        ) ? new Error('hub.mode or hub.topic validation error') : undefined)
    }
}, async (request, reply) => {
    console.log(" ")
    console.log("Hello, you have subscribed to get information about the topic: "+request.query["hub.topic"])
    console.log("The challenge string is: "+request.query["hub.challenge"])
    return request.query["hub.challenge"]
})

server.post<{
    Headers: HeadersSchemaInterface
    Body: BodySchemaInterface 
}>('/listener', {
    schema: {
        headers: HeadersSchema,
        body: BodySchema 
    }, config: {
        rawBody: true
    },
    preValidation: async (request, reply, done) => { 
        const x_hub_signature = request.headers["x-hub-signature"]
        console.log(" ")
        const signature = generateSignature(request.rawBody as string, secret, Algorithm.sha256);
        //console.log("the real signature is      " + signature)
        //console.log("the header signature is    " + x_hub_signature)
        console.log("REQUEST.RAW:", request.rawBody as string)
        let splitted = request.body.topic.split(":");
        done((  
            // to be transformed in a function
            splitted.length !== 4 ||
            splitted[0] !== "vehicle" ||
            splitted[2] !== "generic" ||
            !isSignal(splitted[3]) ||
            !signal_name.has(splitted[3] as Signal ||
            `${Algorithm.sha256}=${x_hub_signature}` !== signature)
        ) ? new Error('Topic ' + request.body.topic + ' or signature ' + x_hub_signature + ' validation error') : undefined)
    }
}, async (request, reply) => {
    let splitted = request.body.topic.split(":");
    const name = splitted[3]
    let data = request.body.payload.data

    console.log(" ")
    console.log("SIGNATURE:         ", request.headers["x-hub-signature"])
    console.log("VEHICLE:           ", splitted[1])
    console.log("SIGNAL TYPE:       ", splitted[2])
    console.log("SIGNAL NAME:       ", name)
    if (name === "position") {
        console.log("VALUE:             ")
        console.log("   Latitude:       ", data.latitude)
        console.log("   Longitude:      ", data.longitude)
    }
    if (name === "autonomy_percentage") {
        console.log("VALUE:             ", data.percentage)
    }
    if (name === "autonomy_meters") {
        console.log("VALUE:             ", data.meters)
    }
    if (name === "distance_covered") {
        console.log("VALUE:             ", data.meters)
    }
    if (name === "online") {
        console.log("VALUE:             ", data.online)
    }
    return {}
})