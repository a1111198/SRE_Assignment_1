// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.1;

import {Test, console} from "forge-std/Test.sol";
import {PingPong} from "../src/PingPong.sol";

contract CounterTest is Test {
    PingPong public pingPong;
    event Ping();
    function setUp() public {
        pingPong = new PingPong();
        console.log(address(pingPong));
    }

    function test_sendPing() external{
        //set expectaions
        //vm.startPrank(makeAddr("89"));
        console.log(block.number);
        vm.expectEmit(true, true, true, true);
        emit Ping(); 
        pingPong.ping();
    }

}
