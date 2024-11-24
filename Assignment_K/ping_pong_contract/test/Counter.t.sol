// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.1;

import {Test, console} from "forge-std/Test.sol";
import {PingPong} from "../src/PingPong.sol";

contract CounterTest is Test {
    PingPong public pingPong;

    function setUp() public {
        pingPong = new PingPong();
    }

    
}
