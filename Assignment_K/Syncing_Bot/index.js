import { ethers } from "ethers";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import fs from "fs-extra";
const ABI = JSON.parse(fs.readFileSync("./PingPongABI.json", "utf8"));
const serviceAccount = JSON.parse(fs.readFileSync("./key.json", "utf8"));
// Command-line arguments
const argv = yargs(hideBin(process.argv))
  .option("rpc_url", {
    alias: "r",
    description: "For RPC_URL",
    type: "string",
    demandOption: true,
  })
  .option("contract", {
    alias: "c",
    description: "Contract address",
    type: "string",
    demandOption: true,
  })
  .option("privateKey", {
    alias: "k",
    description: "Private key for the pong funtion caller",
    type: "string",
    demandOption: true,
  })
  .option("txWaitTimeout", {
    alias: "t",
    description:
      "Timeout in seconds before resending the transaction with a higher gas price (at least 1 minute)",
    type: "number",
    default: 600, // Default to 10 minutes
  })
  .help()
  .alias("help", "h").argv;

// check for private key validity
const PRIVATE_KEY = argv.privateKey;
const RPC_URL = argv.rpc_url;
const CONTRACT_ADDRESS = argv.contract;
let txWaitTimeout = argv.txWaitTimeout || 600; // in seconds
txWaitTimeout = txWaitTimeout * 1000; //in ms

//we need to make sure we are Timingout for significant time like at least 1 minute because If gas fees don't update then we may face
// minimum fees replacement issue.
if (txWaitTimeout < 60 * 1000) {
  throw Error("Timeout in seconds must be minimum 60");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Provider based on rpc_url

const provider = new ethers.getDefaultProvider(RPC_URL);
// get wallet
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
//contract
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

// using DB to store last blockNumber to enable for horizontal scaling.
const lastProcessedDocQuery = db
  .collection("lastProcessed")
  .doc(CONTRACT_ADDRESS);

let startingBlockNumber;
async function main() {
  //  starting block number
  let lastProcessedBlock;

  const lastProcessedDocumentSnapshot = await lastProcessedDocQuery.get();
  if (
    lastProcessedDocumentSnapshot.exists &&
    lastProcessedDocumentSnapshot.data() != undefined &&
    lastProcessedDocumentSnapshot.data()["lastProcessedBlock"] != undefined
  ) {
    lastProcessedBlock =
      lastProcessedDocumentSnapshot.data()["lastProcessedBlock"];
  } else {
    // current block Number from provider
    lastProcessedBlock = await provider.getBlockNumber();
    startingBlockNumber = lastProcessedBlock;
    console.log(`started from block ${startingBlockNumber}`);
  }
  // set this starting number
  await lastProcessedDocQuery.set({ lastProcessedBlock: lastProcessedBlock });

  // started to listen for new blocks
  // prefering block listen over event listen such that during any downtime or anything else we can reporcess missed events
  provider.on("block", async (blockNumber) => {
    try {
      console.log(`New block: ${blockNumber}`);

      // this will handle any missed events If server went down
      await processEventsWithRetry(lastProcessedBlock + 1, blockNumber);

      // update once all other events has been processed.
      lastProcessedBlock = blockNumber;
      if (lastProcessedBlock != NaN) {
        await lastProcessedDocQuery.update({
          lastProcessedBlock: lastProcessedBlock,
        });
      }
    } catch (error) {
      console.error(`Error in block ${blockNumber}:`, error);
    }
  });
}

// here doing it because of API-rate limits as using free API-provider

async function processEventsWithRetry(
  fromBlock,
  toBlock,
  maxRetries = 5,
  initialDelay = 2000
) {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      if (toBlock == startingBlockNumber) return; // because we don't want to process events of starting blcok

      if (fromBlock > toBlock) {
        // this is case for Reorg where chain is back to some block
        fromBlock = toBlock;
      }
      console.log(fromBlock);
      console.log(toBlock);
      const logs = await contract.queryFilter("Ping", fromBlock, toBlock);
      console.log(logs);
      for (const log of logs) {
        const pingTxHash = log.transactionHash;
        console.log(`Ping in tx ${pingTxHash} at block ${log.blockNumber}`);

        // tries to send pong Event
        await sendPongWithRetry(pingTxHash, log.index);
      }
      return;
    } catch (error) {
      attempt++;
      console.error(
        `Error processing events from block ${fromBlock} to ${toBlock}:`,
        error
      );
      if (attempt >= maxRetries) {
        console.error(
          `Max retries reached for pingTxHash ${pingTxHash}. Giving up.`
        );
      }
      await sleep(delay);

      // Exponential backoff for retry mechanism
      delay *= 2;
    }
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPongWithRetry(
  pingTxHash,
  logIndex,
  maxRetries = 5,
  initialDelay = 3000
) {
  let attempt = 0;
  let delay = initialDelay;
  while (attempt < maxRetries) {
    try {
      await sendPong(pingTxHash, logIndex);
      return;
    } catch (error) {
      attempt++;
      console.log(`Retrying get the Error`, error);
      if (attempt >= maxRetries) {
        console.error(
          `Max retries reached for pingTxHash ${pingTxHash}. Giving up.`
        );
      }
      await sleep(delay);

      // Exponential backoff for retry mechanism
      delay *= 2;
    }
  }
}

async function sendPong(pingTxHash, logIndex) {
  let docReference;
  try {
    // Check for pong already sent ?

    const querySnaphot = await db
      .collection("ProcessedEvents")
      .where("pingTxHash", "==", pingTxHash)
      .where("logIndex", "==", logIndex)
      .get();
    if (querySnaphot.size > 0) {
      console.log(`Pong already emitted for tx ${pingTxHash}, skipping.`);
      return;
    }
    // this is necessary to prevent from duplicate Txs during mining and waiting
    docReference = await db.collection("ProcessedEvents").add({
      pingTxHash: pingTxHash,
      logIndex: logIndex,
      contract: CONTRACT_ADDRESS,
      status: "pending",
      timeStamp: FieldValue.serverTimestamp(),
    });
    // Prepare the transaction
    let gasPrice = (await provider.getFeeData()).gasPrice;
    // willing prioritising trasection
    gasPrice = (gasPrice * 120n) / 100n;
    const tx = await contract.pong(pingTxHash, {
      gasLimit: 100000n,
      gasPrice: gasPrice,
    });
    const nonce = tx.nonce;
    console.log(`Pong transaction sent: ${tx.hash}`);
    // Wait for the transaction to be mined
    //throw Error("Not found");

    try {
      const receipt = await tx.wait(1, txWaitTimeout);

      console.log("Pong transaction mined");
      await docReference.update({
        status: "Mined",
      });
    } catch (error) {
      console.log(error);
      // we are having this mechanism to ensure gasPrice Issus so gasPrice is increased
      // timeout error makes sure about no new trasection to replace this nonce
      if (error.code && error.code === "TIMEOUT") {
        let gasPrice = (await provider.getFeeData()).gasPrice;
        // willing prioritising trasection to 40% because so the issue minimum fees replacement does not occure
        gasPrice = (gasPrice * 140n) / 100n;
        const rePriceTx = await contract.pong(pingTxHash, {
          gasLimit: 100000n,
          gasPrice: gasPrice,
          nonce: nonce,
        });
        const receiptRePriceTx = await rePriceTx.wait(1, txWaitTimeout);
        console.log("Pong transaction mined");
        await docReference.update({
          status: "Mined",
        });
      } else {
        // throwing error beacause except timeout issues like replacement etc will be managed by retry mechanism
        throw error;
      }
    }
  } catch (error) {
    // may trasection Replaced or cancel or anything then it will be handled by Retry mechansim
    if (docReference != undefined) {
      await docReference.delete(); // to not retrun without handling
    }
    console.error(`Error sending pong for tx ${pingTxHash}:`, error);
    throw error;
  }
}

main().catch(console.error);
