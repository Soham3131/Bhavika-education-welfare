@echo off
cd /d "c:\Users\soham\Desktop\newjmd\Bhavika-education-welfare"
echo BATCH_STARTED > test_runner.log
echo Testing Node and Vitest... >> test_runner.log
node -v >> test_runner.log 2>&1
echo TEST_DONE > test_runner_done.txt
