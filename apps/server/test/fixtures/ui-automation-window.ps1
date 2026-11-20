Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Name = 'YanZhiUiTest'
$form.Text = 'YanZhi UI Test'
$form.Width = 460
$form.Height = 190
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true

$input = New-Object System.Windows.Forms.TextBox
$input.Name = 'testInput'
$input.AccessibleName = 'TestInput'
$input.Left = 24
$input.Top = 30
$input.Width = 390
$input.Text = 'initial'

$button = New-Object System.Windows.Forms.Button
$button.Name = 'runTestButton'
$button.AccessibleName = 'RunTest'
$button.Left = 24
$button.Top = 72
$button.Width = 120
$button.Text = 'Run Test'

$label = New-Object System.Windows.Forms.Label
$label.Name = 'resultLabel'
$label.AccessibleName = 'ResultLabel'
$label.Left = 164
$label.Top = 78
$label.Width = 250
$label.Text = 'ready'

$button.Add_Click({
  $label.Text = 'clicked'
})

$form.Controls.AddRange(@($input, $button, $label))
[System.Windows.Forms.Application]::Run($form)
