| Step | Command | Run1 | Run2 | Run3 | Pass |
|---|---|---|---|---|---|
| 1 | `node test/verify_engine.js` | PASS | PASS | PASS | 3/3 |
| 2 | `node test/security.js` | PASS | PASS | PASS | 3/3 |
| 3 | `node test/behavior-monitor.js` | PASS | PASS | PASS | 3/3 |
| 4 | `node test/browser-engines.js` | PASS | PASS | PASS | 3/3 |
| 5 | `node test/studio.js` | PASS | PASS | PASS | 3/3 |
| 6 | `node --check src/ui/workflowStudio.js` | PASS | PASS | PASS | 3/3 |
| 7 | `node --check src/ui/renderer.js` | PASS | PASS | PASS | 3/3 |
| 8 | `node --check src/automation/windowBrowser.js` | PASS | PASS | PASS | 3/3 |
| 9 | `node test/maintenance.js` | PASS | PASS | PASS | 3/3 |
| 10 | `node --check src/ui/maintenance.js` | PASS | PASS | PASS | 3/3 |
| 11 | `node test/control-tower.js` | PASS | PASS | PASS | 3/3 |
| 12 | `node --check src/ui/controlTower.js` | PASS | PASS | PASS | 3/3 |
| 13 | `node --check main.js` | PASS | PASS | PASS | 3/3 |
| 14 | `node test/recorder.js` | PASS | PASS | PASS | 3/3 |
| 15 | `node --check src/automation/recorderWindow.js` | PASS | PASS | PASS | 3/3 |
| 16 | `node --check src/automation/recorderPreload.js` | PASS | PASS | PASS | 3/3 |
| 17 | `node --check src/automation/recorder.js` | PASS | PASS | PASS | 3/3 |
| 18 | `node test/isolation.js` | PASS | PASS | PASS | 3/3 |
| 19 | `node test/launcher-isolation.js` | PASS | PASS | PASS | 3/3 |
| 20 | `node test/proxy-center.js` | PASS | PASS | PASS | 3/3 |
| 21 | `node --check src/ui/proxyCenter.js` | PASS | PASS | PASS | 3/3 |
| 22 | `node test/fingerprint-audit.js` | PASS | PASS | PASS | 3/3 |
| 23 | `node --check src/privacy/fingerprintAudit.js` | PASS | PASS | PASS | 3/3 |
| 24 | `node test/dashboard.js` | PASS | PASS | PASS | 3/3 |
| 25 | `node --check src/ui/dashboard.js` | PASS | PASS | PASS | 3/3 |
| 26 | `node test/dashboard-ui.js` | PASS | PASS | PASS | 3/3 |
| 27 | `node test/workspace-ui.js` | PASS | PASS | PASS | 3/3 |
| 28 | `node --check src/ui/icons.js` | PASS | PASS | PASS | 3/3 |
| 29 | `node test/gecko-proxy.js` | PASS | PASS | PASS | 3/3 |
| 30 | `node --check src/engine/geckoProxy.js` | PASS | PASS | PASS | 3/3 |
| 31 | `node test/browser-diagnostics.js` | FAIL | FAIL | FAIL | 0/3 |
| 32 | `node --check src/engine/browserDiagnostics.js` | PASS | PASS | PASS | 3/3 |
| 33 | `node --check src/health/profileHealth.js` | PASS | PASS | PASS | 3/3 |
| 34 | `node test/control-flow.js` | PASS | PASS | PASS | 3/3 |
| 35 | `node --check src/automation/controlFlow.js` | PASS | PASS | PASS | 3/3 |
| 36 | `node test/flow-graph.js` | PASS | PASS | PASS | 3/3 |
| 37 | `node --check src/automation/flowGraph.js` | PASS | PASS | PASS | 3/3 |
| 38 | `node test/flow-graph-ui.js` | PASS | PASS | PASS | 3/3 |
| 39 | `node test/profile-panel.js` | PASS | PASS | PASS | 3/3 |
| 40 | `node --check src/ui/profilePanel.js` | PASS | PASS | PASS | 3/3 |
| 41 | `node test/studio-workspace-ui.js` | PASS | PASS | PASS | 3/3 |
| 42 | `node test/runtime-architecture.js` | PASS | PASS | PASS | 3/3 |
| 43 | `node test/proxy-vault.js` | PASS | PASS | PASS | 3/3 |
| 44 | `node test/proxy-gateway.js` | PASS | PASS | PASS | 3/3 |
| 45 | `node --check src/security/proxyCredentialVault.js` | PASS | PASS | PASS | 3/3 |
| 46 | `node --check src/engine/authenticatedHttpGateway.js` | PASS | PASS | PASS | 3/3 |
| 47 | `node test/proxy-auth-launcher.js` | PASS | PASS | PASS | 3/3 |
| 48 | `node --check src/engine/browserLauncher.js` | PASS | PASS | PASS | 3/3 |
| 49 | `node test/proxy-socks-auth.js` | PASS | PASS | PASS | 3/3 |
| 50 | `node --check src/engine/authenticatedSocksGateway.js` | PASS | PASS | PASS | 3/3 |
| 51 | `node test/proxy-bulk.js` | PASS | PASS | PASS | 3/3 |
| 52 | `node --check src/proxies/bulkImport.js` | PASS | PASS | PASS | 3/3 |
| 53 | `node test/release-readiness.js` | PASS | PASS | PASS | 3/3 |
| 54 | `node test/launcher-early-exit.js` | PASS | PASS | PASS | 3/3 |
| 55 | `node --check src/health/releaseReadiness.js` | PASS | PASS | PASS | 3/3 |
| 56 | `node --check src/backup/configBackup.js` | PASS | PASS | PASS | 3/3 |
| 57 | `node test/support-report.js` | PASS | PASS | PASS | 3/3 |
| 58 | `node --check src/ops/supportReport.js` | PASS | PASS | PASS | 3/3 |
| 59 | `node test/bulk-operations.js` | PASS | PASS | PASS | 3/3 |
| 60 | `node --check src/ops/operations.js` | PASS | PASS | PASS | 3/3 |
| 61 | `node test/backup-transaction.js` | PASS | PASS | PASS | 3/3 |
| 62 | `node test/profile-deletion-backup-drill.js` | PASS | PASS | PASS | 3/3 |
| 63 | `node --check src/backup/configBackup.js` | PASS | PASS | PASS | 3/3 |
| 64 | `node test/local-scheduler.js` | PASS | PASS | PASS | 3/3 |
| 65 | `node --check src/automation/localScheduler.js` | PASS | PASS | PASS | 3/3 |
| 66 | `node test/scheduler-ui.js` | PASS | PASS | PASS | 3/3 |
| 67 | `node test/store-persistence.js` | PASS | PASS | PASS | 3/3 |
| 68 | `node test/workflow-persistence.js` | PASS | PASS | PASS | 3/3 |
| 69 | `node test/api-profile-updates.js` | PASS | PASS | PASS | 3/3 |
| 70 | `node test/api-profile-minimization.js` | PASS | PASS | PASS | 3/3 |
| 71 | `node test/quick-create.js` | PASS | PASS | PASS | 3/3 |
| 72 | `node test/profile-csv-import.js` | PASS | PASS | PASS | 3/3 |
| 73 | `node --check src/ui/profileImport.js` | PASS | PASS | PASS | 3/3 |
| 74 | `node test/bulk-tags.js` | PASS | PASS | PASS | 3/3 |
| 75 | `node --check src/ui/bulkTags.js` | PASS | PASS | PASS | 3/3 |
| 76 | `node test/profile-trash.js` | PASS | PASS | PASS | 3/3 |
| 77 | `node --check src/ui/profileTrash.js` | PASS | PASS | PASS | 3/3 |
| 78 | `node test/table-preferences.js` | PASS | PASS | PASS | 3/3 |
| 79 | `node --check src/ui/tablePreferences.js` | PASS | PASS | PASS | 3/3 |
| 80 | `node test/profile-csv-update.js` | PASS | PASS | PASS | 3/3 |
| 81 | `node --check src/ui/profileCsvUpdate.js` | PASS | PASS | PASS | 3/3 |
| 82 | `node test/window-management.js` | PASS | PASS | PASS | 3/3 |
| 83 | `node --check src/ui/windowManager.js` | PASS | PASS | PASS | 3/3 |
| 84 | `node test/extension-center.js` | PASS | PASS | PASS | 3/3 |
| 85 | `node --check src/ui/extensionCenter.js` | PASS | PASS | PASS | 3/3 |
| 86 | `node test/lockfile-integrity.js` | PASS | PASS | PASS | 3/3 |
| 87 | `node test/local-cli.js` | PASS | PASS | PASS | 3/3 |
| 88 | `node test/cache-manager.js` | PASS | PASS | PASS | 3/3 |
| 89 | `node --check src/ui/cacheManager.js` | PASS | PASS | PASS | 3/3 |
| 90 | `node test/profile-edit-guard.js` | PASS | PASS | PASS | 3/3 |
| 91 | `node test/tool-menu.js` | PASS | PASS | PASS | 3/3 |
| 92 | `node --check src/ui/toolMenu.js` | PASS | PASS | PASS | 3/3 |
| 93 | `node test/ai-advisor.js` | PASS | PASS | PASS | 3/3 |
| 94 | `node test/ai-advisor-ui.js` | PASS | PASS | PASS | 3/3 |
| 95 | `node --check src/ui/aiAdvisor.js` | PASS | PASS | PASS | 3/3 |
| 96 | `node test/ai-workflow-draft.js` | PASS | PASS | PASS | 3/3 |
| 97 | `node test/parity-audit.js` | PASS | PASS | PASS | 3/3 |
| 98 | `node tools/parity-audit.js --report` | PASS | PASS | PASS | 3/3 |
| 99 | `node test/live-navigation.js` | PASS | PASS | PASS | 3/3 |
| 100 | `node test/rpa-batch.js` | PASS | PASS | PASS | 3/3 |
| 101 | `node --check src/ui/batchStudio.js` | PASS | PASS | PASS | 3/3 |
| 102 | `node test/rpa-batch-ui.js` | PASS | PASS | PASS | 3/3 |
| 103 | `node test/session-snapshots.js` | PASS | PASS | PASS | 3/3 |
| 104 | `node test/session-snapshots-ui.js` | PASS | PASS | PASS | 3/3 |
| 105 | `node --check src/ui/sessionSnapshots.js` | PASS | PASS | PASS | 3/3 |
| 106 | `node test/snapshot-portability.js` | PASS | PASS | PASS | 3/3 |
| 107 | `node --check src/ops/snapshotPortability.js` | PASS | PASS | PASS | 3/3 |
| 108 | `node test/snapshot-recovery.js` | PASS | PASS | PASS | 3/3 |
| 109 | `node --check src/ops/snapshotRecovery.js` | PASS | PASS | PASS | 3/3 |
| 110 | `node test/license-center.js` | PASS | PASS | PASS | 3/3 |
| 111 | `node test/license-center-ui.js` | PASS | PASS | PASS | 3/3 |
| 112 | `node --check src/ui/licenseCenter.js` | PASS | PASS | PASS | 3/3 |
| 113 | `node test/engine-evaluation.js` | PASS | PASS | PASS | 3/3 |
| 114 | `node test/license-enforcement.js` | PASS | PASS | PASS | 3/3 |
| 115 | `node test/license-policy-integration.js` | PASS | PASS | PASS | 3/3 |
| 116 | `node test/license-state-matrix.js` | PASS | PASS | PASS | 3/3 |
| 117 | `node test/update-check.js` | PASS | PASS | PASS | 3/3 |
| 118 | `node test/license-online.js` | PASS | PASS | PASS | 3/3 |
| 119 | `node test/license-online-ui.js` | PASS | PASS | PASS | 3/3 |
| 120 | `node test/runtime-registry.js` | FAIL | FAIL | FAIL | 0/3 |
| 121 | `node test/runtime-registry-ui.js` | PASS | PASS | PASS | 3/3 |
| 122 | `node --check src/engine/runtimeRegistry.js` | PASS | PASS | PASS | 3/3 |
| 123 | `node test/license-admin.js` | PASS | PASS | PASS | 3/3 |
| 124 | `node --check tools/license-admin.js` | PASS | PASS | PASS | 3/3 |
| 125 | `node test/license-dashboard.js` | PASS | PASS | PASS | 3/3 |
| 126 | `node --check tools/license-dashboard.js` | PASS | PASS | PASS | 3/3 |
| 127 | `node test/app-identity.js` | PASS | PASS | PASS | 3/3 |
| 128 | `node --check src/ui/appIdentity.js` | PASS | PASS | PASS | 3/3 |
| 129 | `node test/premium-workspace.js` | PASS | PASS | PASS | 3/3 |
| 130 | `node --check src/ui/premiumWorkspace.js` | PASS | PASS | PASS | 3/3 |
| 131 | `node test/workspace-interactions.js` | PASS | PASS | PASS | 3/3 |
| 132 | `node --check src/ui/workspaceInteractions.js` | PASS | PASS | PASS | 3/3 |
| 133 | `node test/signal-chain.js` | PASS | PASS | PASS | 3/3 |
| 134 | `node test/extension-literal-safety.js` | PASS | PASS | PASS | 3/3 |
| 135 | `node test/bundled-engine-status.js` | PASS | PASS | PASS | 3/3 |
| 136 | `node test/camoufox-adapter.js` | PASS | PASS | PASS | 3/3 |
| 137 | `node test/camoufox-identity.js` | PASS | PASS | PASS | 3/3 |
| 138 | `node --check src/engine/camoufoxIdentity.js` | PASS | PASS | PASS | 3/3 |
| 139 | `node test/auto-ip-warnings.js` | PASS | PASS | PASS | 3/3 |
| 140 | `node --check src/health/autoIpWarnings.js` | PASS | PASS | PASS | 3/3 |
| 141 | `node test/runtime-egress-observation.js` | PASS | PASS | PASS | 3/3 |
| 142 | `node --check src/health/runtimeEgressObservation.js` | PASS | PASS | PASS | 3/3 |
| 143 | `node test/behavior-patterns.js` | PASS | PASS | PASS | 3/3 |
| 144 | `node --check src/monitor/behaviorPatterns.js` | PASS | PASS | PASS | 3/3 |
| 145 | `node test/local-health-drift.js` | PASS | PASS | PASS | 3/3 |
| 146 | `node --check src/ui/engineSource.js` | PASS | PASS | PASS | 3/3 |
| 147 | `node --check tools/sign-bundled-engine.js` | PASS | PASS | PASS | 3/3 |
| 148 | `node test/per-profile-engine-factory.js` | PASS | PASS | PASS | 3/3 |
| 149 | `node test/camoufox-bundle-integrity.js` | PASS | PASS | PASS | 3/3 |
| 150 | `node test/camoufox-install.js` | PASS | PASS | PASS | 3/3 |
| 151 | `node --check src/engine/camoufoxInstallService.js` | PASS | PASS | PASS | 3/3 |
| 152 | `node test/camoufox-download.js` | PASS | PASS | PASS | 3/3 |
| 153 | `node --check tools/test-camoufox-proxy.mjs` | PASS | PASS | PASS | 3/3 |
| 154 | `node --check src/engine/camoufoxPublisherTrust.js` | PASS | PASS | PASS | 3/3 |
| 155 | `node test/camoufox-runtime-gate.js` | PASS | PASS | PASS | 3/3 |
| 156 | `node --check src/engine/camoufoxRuntimeGate.js` | PASS | PASS | PASS | 3/3 |
| 157 | `node test/camoufox-lab-gate.js` | PASS | PASS | PASS | 3/3 |
| 158 | `node test/camoufox-proxy-plan.js` | PASS | PASS | PASS | 3/3 |
| 159 | `node test/camoufox-proxy-lifecycle.js` | PASS | PASS | PASS | 3/3 |
| 160 | `node test/camoufox-api-automation-guard.js` | PASS | PASS | PASS | 3/3 |
| 161 | `node --check src/engine/camoufoxProxyPlan.js` | PASS | PASS | PASS | 3/3 |
| 162 | `node test/camoufox-local-api-contract.js` | PASS | PASS | PASS | 3/3 |
| 163 | `node test/integration/camoufox-playwright.test.js` | PASS | PASS | PASS | 3/3 |
| 164 | `node test/integration/proxy-auth.test.js` | PASS | PASS | PASS | 3/3 |
| 165 | `node test/integration/camoufox-api-playwright.test.js` | PASS | PASS | PASS | 3/3 |
| 166 | `node test/integration/network-safety.test.js` | PASS | PASS | PASS | 3/3 |
| 167 | `node --check src/engine/CamoufoxPlaywrightController.js` | PASS | PASS | PASS | 3/3 |
| 168 | `node --check src/engine/NetworkSafetyCheck.js` | PASS | PASS | PASS | 3/3 |
| 169 | `node --check src/engine/CamoufoxProfileManager.js` | PASS | PASS | PASS | 3/3 |
| 170 | `node test/integration/engine-factory-playwright.test.js` | PASS | PASS | PASS | 3/3 |
| 171 | `node test/integration/camoufox-close-failure.test.js` | PASS | PASS | PASS | 3/3 |
| 172 | `node test/integration/camoufox-launcher-stop.test.js` | PASS | PASS | PASS | 3/3 |
| 173 | `node test/graph-defense-selective.js` | PASS | PASS | PASS | 3/3 |
| 174 | `node test/selective-core-gate.js` | PASS | PASS | PASS | 3/3 |
| 175 | `node stage0-measure/test.js` | PASS | PASS | PASS | 3/3 |
| 176 | `node --check stage0-measure/run.js` | PASS | PASS | PASS | 3/3 |
| 177 | `node --check stage0-measure/run-config.js` | PASS | PASS | PASS | 3/3 |
| 178 | `node --check stage0-measure/core.js` | PASS | PASS | PASS | 3/3 |
| 179 | `node --check tools/generate-camoufox-identity.mjs` | PASS | PASS | PASS | 3/3 |
| 180 | `node test/camoufox-engine-source-hardening.js` | PASS | PASS | PASS | 3/3 |
| 181 | `node test/camoufox-engine-distribution.js` | PASS | PASS | PASS | 3/3 |
| 182 | `node test/profile-lifecycle.js` | PASS | PASS | PASS | 3/3 |
| 183 | `node test/camoufox-env-delivery.js` | PASS | PASS | PASS | 3/3 |
| 184 | `node test/network-safety-fail-closed.js` | PASS | PASS | PASS | 3/3 |
| 185 | `node test/network-safety-ice-classification.js` | PASS | PASS | PASS | 3/3 |
| 186 | `node test/warning-service.js` | PASS | PASS | PASS | 3/3 |
| 187 | `node test/warning-history.js` | PASS | PASS | PASS | 3/3 |
| 188 | `node --check src/monitor/warningHistory.js` | PASS | PASS | PASS | 3/3 |
| 189 | `node test/fleet-scale.js` | PASS | PASS | PASS | 3/3 |
| 190 | `node test/integration-wiring.js` | PASS | PASS | PASS | 3/3 |
| 191 | `node test/first-run-ux.js` | PASS | PASS | PASS | 3/3 |
| 192 | `node test/criteria-checklist-provider.js` | PASS | PASS | PASS | 3/3 |
| 193 | `node --check src/monitor/warningService.js` | PASS | PASS | PASS | 3/3 |
| 194 | `node --check src/health/exitIpObservations.js` | PASS | PASS | PASS | 3/3 |
| 195 | `node --check src/engine/camoufoxProvisioning.js` | PASS | PASS | PASS | 3/3 |
| 196 | `node --check src/ui/criteriaChecklist.js` | PASS | PASS | PASS | 3/3 |
| 197 | `node --check src/ui/criteriaChecklistProvider.js` | PASS | PASS | PASS | 3/3 |
| 198 | `node stage0-measure/test-isolation.js` | PASS | PASS | PASS | 3/3 |
| 199 | `node --check stage0-measure/run-isolation.js` | PASS | PASS | PASS | 3/3 |
| 200 | `node --check stage0-measure/run-runtime-egress.js` | PASS | PASS | PASS | 3/3 |
| 201 | `node test/run-all-selftest.js` | PASS | PASS | PASS | 3/3 |
