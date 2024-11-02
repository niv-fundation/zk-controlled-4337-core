// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

import {SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {SetHelper} from "@solarity/solidity-lib/libs/arrays/SetHelper.sol";

contract Paymaster is BasePaymaster {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SetHelper for EnumerableSet.AddressSet;

    constructor(IEntryPoint entryPoint_) BasePaymaster(entryPoint_) {}

    function _validatePaymasterUserOp(
        PackedUserOperation calldata,
        bytes32,
        uint256
    ) internal view override returns (bytes memory context, uint256 validationData) {
        context = new bytes(0);

        validationData = SIG_VALIDATION_SUCCESS;
    }
}
