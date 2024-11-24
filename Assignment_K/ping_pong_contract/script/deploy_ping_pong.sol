// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.1;

import {Script, console} from "forge-std/Script.sol";
import {PingPong} from "../src/PingPong.sol";

contract CounterScript is Script {
 

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

       new PingPong();

        vm.stopBroadcast();
    }
}
