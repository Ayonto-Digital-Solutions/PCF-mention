#!/usr/bin/env python3
"""Adds the probe flow to a copy of the solution source."""
import sys
from pathlib import Path

root, guid, bare = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
entry = f"""  <Workflows>
    <Workflow WorkflowId="{guid}" Name="Ayonto - Send Mention Notification">
      <JsonFileName>/Workflows/AyontoSendMentionNotification-{bare}.json</JsonFileName>
      <Type>1</Type>
      <Subprocess>0</Subprocess>
      <Category>5</Category>
      <Mode>0</Mode>
      <Scope>4</Scope>
      <OnDemand>0</OnDemand>
      <TriggerOnCreate>0</TriggerOnCreate>
      <TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutodelete>0</AsyncAutodelete>
      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>1</StateCode>
      <StatusCode>2</StatusCode>
      <RunAs>1</RunAs>
      <IsTransacted>1</IsTransacted>
      <IntroducedVersion>1.0.0.0</IntroducedVersion>
      <IsCustomizable>1</IsCustomizable>
      <PrimaryEntity>none</PrimaryEntity>
      <LocalizedNames>
        <LocalizedName description="Ayonto - Send Mention Notification" languagecode="1033" />
      </LocalizedNames>
    </Workflow>
  </Workflows>"""

cust = root / "src/Other/Customizations.xml"
text = cust.read_text(encoding="utf-8")
assert "  <Workflows />" in text
cust.write_text(text.replace("  <Workflows />", entry, 1), encoding="utf-8")

sol = root / "src/Other/Solution.xml"
text = sol.read_text(encoding="utf-8")
marker = '<RootComponent type="1" schemaName="ayonto_mention" behavior="0" />'
assert marker in text
sol.write_text(text.replace(marker, marker + f'\n      <RootComponent type="29" id="{guid}" behavior="0" />', 1), encoding="utf-8")
print("flow added")
