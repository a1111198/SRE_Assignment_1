/**
 *Submitted for verification at Etherscan.io on 2024-02-07
*/

// SPDX-License-Identifier: GPL-3.0
/**
 *  @authors: [@mtsalenc, @salgozino]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.1;

/**
 * @title PingPongBot 
 * @dev to test for Internal trasections 
 */
contract PingPongCallingBot {

    address public pinger;

    constructor() {
        pinger = msg.sender;
    }

    event Ping();
    event Pong(bytes32 txHash);
    event NewPinger(address pinger);

    function callPing(uint256 n, address contractAddress) external {
        for(uint256 i=0 ;i<n; i++){
            (bool success, )=  contractAddress.call(abi.encodeWithSignature("ping()"));
            require(success);
        }
    }

    function changePinger(address _pinger) external {
        require(msg.sender == pinger, "Only the pinger can call this.");
        pinger = _pinger;

        emit NewPinger(pinger);
    }



    
}