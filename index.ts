import express = require("express");
// import body parser
import * as bodyParser from "body-parser";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { BodySchema as BodySchemaInterface } from "./types/body";
import { HeadersSchema as HeadersSchemaInterface } from "./types/headers";

const server = express();

dotenv.config();

export const SECRET = process.env.SECRET as string;

type Signal =
  | "online"
  | "position"
  | "distance_covered"
  | "autonomy_percentage"
  | "autonomy_meters"
  | "*";
const signal_name = new Set<Signal>([
  "online",
  "position",
  "distance_covered",
  "autonomy_percentage",
  "autonomy_meters",
  "*",
]);
function isSignal(signal: string): signal is Signal {
  return signal_name.has(signal as Signal);
}

enum Algorithm {
  sha256 = "sha256",
}
const generateSignature = (
  message: string,
  secret: string,
  algorithm: string
): string => {
  if (!secret) {
    return "";
  }
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(message, "utf8");
  return `${algorithm}=${hmac.digest("hex")}`;
};

let splitted: string[];
function validateTopic(topic: string): boolean {
  splitted = topic.split(":");
  return (
    splitted.length !== 4 ||
    splitted[0] !== "vehicle" ||
    splitted[2] !== "generic" ||
    !isSignal(splitted[3]) ||
    !signal_name.has(splitted[3] as Signal)
  );
}

server.listen(8080, () => {
  console.log(`Server listening at port 8080`);
});

server.get("/listener", async (req, res) => {
  console.log(" ");
  console.log(
    "Hello, you have subscribed to get information about the topic: " +
      req.query["hub.topic"]
  );
  console.log("The challenge string is: " + req.query["hub.challenge"]);
  res.set("Content-Type", "text/plain").send(req.query["hub.challenge"]);
});

server.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      // check for the signature
      const signature = req.headers["x-hub-signature"] as string | null;
      if (!signature) {
        throw new Error("No signature found");
      }
      // get signature algorithm
      let calculatedSignature = generateSignature(
        buf.toString("utf-8"),
        SECRET,
        Algorithm.sha256
      );
      // compare signatures safely with crypto
      if (
        !crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(calculatedSignature)
        )
      ) {
        throw new Error("Invalid signature");
      }
    },
  })
);

server.post<{
  Headers: HeadersSchemaInterface;
  Body: BodySchemaInterface;
}>("/listener", async (request, reply) => {
  validateTopic(request.body.topic);
  console.log(" ");
  console.log("SIGNATURE:         ", request.headers["x-hub-signature"]);
  console.log("VEHICLE:           ", splitted[1]);
  console.log("SIGNAL TYPE:       ", splitted[2]);
  console.log("SIGNAL NAME:       ", splitted[3]);
  if (splitted[3] === "position") {
    console.log("VALUE:             ");
    console.log("   Latitude:       ", request.body.payload.data.latitude);
    console.log("   Longitude:      ", request.body.payload.data.longitude);
  }
  if (splitted[3] === "autonomy_percentage") {
    console.log("VALUE:             ", request.body.payload.data.percentage);
  }
  if (splitted[3] === "autonomy_meters") {
    console.log("VALUE:             ", request.body.payload.data.meters);
  }
  if (splitted[3] === "distance_covered") {
    console.log("VALUE:             ", request.body.payload.data.meters);
  }
  if (splitted[3] === "online") {
    console.log("VALUE:             ", request.body.payload.data.online);
  }
  reply.json({});
});
