pragma circom 2.0.0;

template DeonticDischargeV1() {
    signal input obligation;
    signal input expected_discharge;
    signal input permitted;
    signal input not_prohibited;
    signal obligation_and_permission;

    obligation * (obligation - 1) === 0;
    expected_discharge * (expected_discharge - 1) === 0;
    permitted * (permitted - 1) === 0;
    not_prohibited * (not_prohibited - 1) === 0;

    obligation_and_permission <== obligation * permitted;
    expected_discharge === obligation_and_permission * not_prohibited;
}

component main { public [obligation, expected_discharge] } = DeonticDischargeV1();
