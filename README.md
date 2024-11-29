# SRE_Assignment_1

## Bot Syncing

This repository contains a syncing bot, which is part of an assignment by the Kleros team for Site Reliability Engineers (SRE). The bot's purpose is to send a transaction for the Pong function every time a Ping event is emitted by a pre-deployed contract. Whenever a Ping event is emitted, this bot will trigger a Pong transaction.

### Design Decisions:

- **Block Listener**: Instead of using a direct event listener, the bot uses a block listener. This approach ensures that no Ping events are missed, even in case of network issues or interruptions. It listens for events emitted during the block emission, preventing missed events.
- **Chain Reorg Handling**: The bot also accounts for chain reorganizations, where the block number may be lower than the last processed block number. This ensures the bot can handle such reorgs gracefully.

- **Storing Last Processed Block**: The bot stores the last processed block number in Firebase Firestore. This allows it to continue processing from that point if there is any disruption or halt in operations.

- **Database Choice**: A database is used instead of a simple text file to store the last processed block. This choice enables horizontal scalability for the bot.

- **Retry Mechanism**: An exponential backoff retry mechanism is implemented. This means the delay between retries increases with each attempt. This is important as we're using a free API provider, and in case of significant load or rate limits, the retry mechanism helps handle such scenarios smoothly.

- **Transaction State Management**: To ensure that each Ping event has exactly one corresponding Pong event, we maintain the state of every transaction in the database.

- **Gas Fees**: The bot prioritizes gas fees at 20% above the base rate to ensure that the transaction is mined. If a timeout occurs (with a default timeout of 10 minutes), the bot increases the gas fee to 40% above normal to expedite the mining process.

- **Batch Transactions**: Transactions are stored in batches along with their log index in the database. This is done because it's possible that two transactions might be emitted as part of the same internal transaction.

---

### Setup Instructions:

1. Clone this repository: [https://github.com/a1111198/SRE_Assignment_1](https://github.com/a1111198/SRE_Assignment_1), and navigate to the "Syncing Bot" directory.

2. Make sure you're using **Node version v18.19.1**.

3. Create a new project in the Firebase Cloud Console and configure Firestore (select the region and set database rules to allow read and write access).

4. Download a Firebase service account key and place it as `key.json` in the main syncing bot folder.

5. To start the bot, run the server with the following command:

   ```
   node index.js --rpc_url=API_PROVIDER_URL --contract=DEPLOYED_PING_PONG_CONTRACT_ADDRESS --privateKey=PRIVATE_KEY --txWaitTimeout=600
   ```

   - `rpc_url`: The API provider URL (e.g., Alchemy Sepolia testnet URL) _(required)_
   - `contract`: The address of the deployed Ping-Pong contract _(required)_
   - `privateKey`: The private key to call the Pong function _(required)_
   - `txWaitTimeout`: The timeout for waiting for the transaction to be mined (default is 600 seconds, minimum is 60 seconds)

6. The bot can be run with any RPC URL, but for this example, I am using the Sepolia RPC URL. Any private key is allowed to call the Pong function, as no permission checks are in place.

7. Ensure you have enough Sepolia Ether in your wallet to call the Pong function.
