Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="YanZhi WPF UI Test"
        Width="460" Height="190"
        WindowStartupLocation="CenterScreen"
        Topmost="True">
  <StackPanel Margin="24">
    <TextBox Name="testInput"
             AutomationProperties.AutomationId="testInput"
             AutomationProperties.Name="TestInput"
             Text="initial" />
    <StackPanel Orientation="Horizontal" Margin="0,14,0,0">
      <Button Name="runTestButton"
              AutomationProperties.AutomationId="runTestButton"
              AutomationProperties.Name="Run Test"
              Content="Run Test"
              Width="120" />
      <TextBlock Name="resultLabel"
                 AutomationProperties.AutomationId="resultLabel"
                 Text="ready"
                 VerticalAlignment="Center"
                 Margin="16,0,0,0" />
    </StackPanel>
  </StackPanel>
</Window>
'@

$window = [System.Windows.Markup.XamlReader]::Parse($xaml)
$button = $window.FindName('runTestButton')
$label = $window.FindName('resultLabel')
$button.Add_Click({
  if ($window.FindName('testInput').Text -eq 'hello-semantic') {
    $label.Text = 'clicked'
  } else {
    $label.Text = 'wrong-value'
  }
})
$window.ShowDialog() | Out-Null
