#!/usr/bin/env bash
set -e

echo "==============================================================================="
echo "       JAI MAA DURGA PHASE 2 - EXECUTABLE TEST SUITE (GIT BASH)"
echo "==============================================================================="

mkdir -p test_results

echo ""
echo "[1/9] Running: npx vitest run src/tests/phase2-autonomous-sprint.test.ts"
npx vitest run src/tests/phase2-autonomous-sprint.test.ts --no-color 2>&1 | tee test_results/phase2-autonomous-sprint.log || true
EXIT_PHASE2=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_PHASE2"

echo ""
echo "[2/9] Running: npx vitest run src/tests/jewellery-tax-cod-plans.test.ts"
npx vitest run src/tests/jewellery-tax-cod-plans.test.ts --no-color 2>&1 | tee test_results/jewellery-tax-cod-plans.log || true
EXIT_JEWELLERY=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_JEWELLERY"

echo ""
echo "[3/9] Running: npx vitest run src/tests/store-phase-b.test.ts"
npx vitest run src/tests/store-phase-b.test.ts --no-color 2>&1 | tee test_results/store-phase-b.log || true
EXIT_STORE_B=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_STORE_B"

echo ""
echo "[4/9] Running: npx vitest run src/tests/multi-deployment.test.ts"
npx vitest run src/tests/multi-deployment.test.ts --no-color 2>&1 | tee test_results/multi-deployment.log || true
EXIT_MULTI_DEP=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_MULTI_DEP"

echo ""
echo "[5/9] Running: npm test"
npm test -- --no-color 2>&1 | tee test_results/npm_test.log || true
EXIT_NPM_TEST=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_NPM_TEST"

echo ""
echo "[6/9] Running: npm run typecheck"
npm run typecheck 2>&1 | tee test_results/typecheck.log || true
EXIT_TYPECHECK=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_TYPECHECK"

echo ""
echo "[7/9] Running: npm run lint"
npm run lint 2>&1 | tee test_results/lint.log || true
EXIT_LINT=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_LINT"

echo ""
echo "[8/9] Running: npm run build"
npm run build 2>&1 | tee test_results/build.log || true
EXIT_BUILD=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_BUILD"

echo ""
echo "[9/9] Running: npx tsx scripts/verify-indexes.ts"
npx tsx scripts/verify-indexes.ts 2>&1 | tee test_results/verify_indexes.log || true
EXIT_INDEXES=${PIPESTATUS[0]}
echo "Exit Code: $EXIT_INDEXES"

echo ""
echo "==============================================================================="
echo "                           SUMMARY OF EXECUTION"
echo "==============================================================================="
echo "1. phase2-autonomous-sprint.test.ts : Exit $EXIT_PHASE2"
echo "2. jewellery-tax-cod-plans.test.ts   : Exit $EXIT_JEWELLERY"
echo "3. store-phase-b.test.ts            : Exit $EXIT_STORE_B"
echo "4. multi-deployment.test.ts         : Exit $EXIT_MULTI_DEP"
echo "5. npm test                         : Exit $EXIT_NPM_TEST"
echo "6. npm run typecheck                : Exit $EXIT_TYPECHECK"
echo "7. npm run lint                     : Exit $EXIT_LINT"
echo "8. npm run build                    : Exit $EXIT_BUILD"
echo "9. verify-indexes.ts                : Exit $EXIT_INDEXES"
echo "==============================================================================="

cat <<EOF > test_results/summary.env
EXIT_PHASE2=$EXIT_PHASE2
EXIT_JEWELLERY=$EXIT_JEWELLERY
EXIT_STORE_B=$EXIT_STORE_B
EXIT_MULTI_DEP=$EXIT_MULTI_DEP
EXIT_NPM_TEST=$EXIT_NPM_TEST
EXIT_TYPECHECK=$EXIT_TYPECHECK
EXIT_LINT=$EXIT_LINT
EXIT_BUILD=$EXIT_BUILD
EXIT_INDEXES=$EXIT_INDEXES
EOF

echo "ALL_TESTS_COMPLETED" > test_results/DONE.txt
echo "Results saved to test_results/ directory."
