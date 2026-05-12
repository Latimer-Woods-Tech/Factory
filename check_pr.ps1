while ($true) {
  $result = gh pr view 291 --json statusCheckRollup --jq '.statusCheckRollup | map(.status) | group_by(.) | map({status: .[0], count: length})'
  Write-Host (Get-Date): $result
  $allComplete = gh pr view 291 --json statusCheckRollup --jq '.statusCheckRollup | all(.status == "COMPLETED")'
  if ($allComplete) { Write-Host 'Checks complete'; break }
  Start-Sleep 20
}
