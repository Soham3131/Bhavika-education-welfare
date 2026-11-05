@echo off
setlocal enabledelayedexpansion

echo ===============================================================================
echo     JAI MAA DURGA PHASE 2 - EXECUTABLE TEST SUITE RUNNER
echo ===============================================================================

cd /d "c:\Users\soham\Desktop\newjmd\Bhavika-education-welfare"

if not exist "test_results" mkdir "test_results"

echo.
echo [1/9] Running: npx vitest run src/tests/phase2-autonomous-sprint.test.ts
call npx vitest run src/tests/phase2-autonomous-sprint.test.ts --no-color > test_results\phase2-autonomous-sprint.log 2>&1
set EXIT_PHASE2=%ERRORLEVEL%
echo Exit Code: %EXIT_PHASE2%

echo.
echo [2/9] Running: npx vitest run src/tests/jewellery-tax-cod-plans.test.ts
call npx vitest run src/tests/jewellery-tax-cod-plans.test.ts --no-color > test_results\jewellery-tax-cod-plans.log 2>&1
set EXIT_JEWELLERY=%ERRORLEVEL%
echo Exit Code: %EXIT_JEWELLERY%

echo.
echo [3/9] Running: npx vitest run src/tests/store-phase-b.test.ts
call npx vitest run src/tests/store-phase-b.test.ts --no-color > test_results\store-phase-b.log 2>&1
set EXIT_STORE_B=%ERRORLEVEL%
echo Exit Code: %EXIT_STORE_B%

echo.
echo [4/9] Running: npx vitest run src/tests/multi-deployment.test.ts
call npx vitest run src/tests/multi-deployment.test.ts --no-color > test_results\multi-deployment.log 2>&1
set EXIT_MULTI_DEP=%ERRORLEVEL%
echo Exit Code: %EXIT_MULTI_DEP%

echo.
echo [5/9] Running: npm test
call npm test -- --no-color > test_results\npm_test.log 2>&1
set EXIT_NPM_TEST=%ERRORLEVEL%
echo Exit Code: %EXIT_NPM_TEST%

echo.
echo [6/9] Running: npm run typecheck
call npm run typecheck > test_results\typecheck.log 2>&1
set EXIT_TYPECHECK=%ERRORLEVEL%
echo Exit Code: %EXIT_TYPECHECK%

echo.
echo [7/9] Running: npm run lint
call npm run lint > test_results\lint.log 2>&1
set EXIT_LINT=%ERRORLEVEL%
echo Exit Code: %EXIT_LINT%

echo.
echo [8/9] Running: npm run build
call npm run build > test_results\build.log 2>&1
set EXIT_BUILD=%ERRORLEVEL%
echo Exit Code: %EXIT_BUILD%

echo.
echo [9/9] Running: npx tsx scripts/verify-indexes.ts
call npx tsx scripts/verify-indexes.ts > test_results\verify_indexes.log 2>&1
set EXIT_INDEXES=%ERRORLEVEL%
echo Exit Code: %EXIT_INDEXES%

echo.
echo ===============================================================================
echo                           SUMMARY OF EXECUTION
echo ===============================================================================
echo 1. phase2-autonomous-sprint.test.ts : Exit %EXIT_PHASE2%
echo 2. jewellery-tax-cod-plans.test.ts   : Exit %EXIT_JEWELLERY%
echo 3. store-phase-b.test.ts            : Exit %EXIT_STORE_B%
echo 4. multi-deployment.test.ts         : Exit %EXIT_MULTI_DEP%
echo 5. npm test                         : Exit %EXIT_NPM_TEST%
echo 6. npm run typecheck                : Exit %EXIT_TYPECHECK%
echo 7. npm run lint                     : Exit %EXIT_LINT%
echo 8. npm run build                    : Exit %EXIT_BUILD%
echo 9. verify-indexes.ts                : Exit %EXIT_INDEXES%
echo ===============================================================================

(
  echo EXIT_PHASE2=%EXIT_PHASE2%
  echo EXIT_JEWELLERY=%EXIT_JEWELLERY%
  echo EXIT_STORE_B=%EXIT_STORE_B%
  echo EXIT_MULTI_DEP=%EXIT_MULTI_DEP%
  echo EXIT_NPM_TEST=%EXIT_NPM_TEST%
  echo EXIT_TYPECHECK=%EXIT_TYPECHECK%
  echo EXIT_LINT=%EXIT_LINT%
  echo EXIT_BUILD=%EXIT_BUILD%
  echo EXIT_INDEXES=%EXIT_INDEXES%
) > test_results\summary.env

echo ALL_TESTS_COMPLETED > test_results\DONE.txt
