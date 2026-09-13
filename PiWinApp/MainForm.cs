using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using PiCore;

namespace PiWinApp;

public sealed class MainForm : Form
{
    private readonly ComboBox algorithmComboBox;
    private readonly NumericUpDown iterationsNumericUpDown;
    private readonly Button computeButton;
    private readonly ProgressBar progressBar;
    private readonly Label resultLabel;
    private readonly Label elapsedLabel;
    private CancellationTokenSource? cts;

    public MainForm()
    {
        Text = "π Calculator";
        Width = 520;
        Height = 240;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        var algorithmLabel = new Label { Left = 16, Top = 20, Width = 120, Text = "Algorithm:" };
        algorithmComboBox = new ComboBox { Left = 140, Top = 16, Width = 340, DropDownStyle = ComboBoxStyle.DropDownList };
        algorithmComboBox.Items.AddRange(new object[] { "Gauss-Legendre", "Nilakantha", "Leibniz" });
        algorithmComboBox.SelectedIndex = 0;

        var iterationsLabel = new Label { Left = 16, Top = 56, Width = 120, Text = "Iterations:" };
        iterationsNumericUpDown = new NumericUpDown { Left = 140, Top = 52, Width = 100, Minimum = 1, Maximum = 1_000_000, Value = 5 };

        computeButton = new Button { Left = 260, Top = 50, Width = 220, Text = "Compute" };
        computeButton.Click += ComputeButtonOnClick;

        progressBar = new ProgressBar { Left = 16, Top = 92, Width = 464, Height = 20, Minimum = 0, Maximum = 100 };

        resultLabel = new Label { Left = 16, Top = 124, Width = 464, Height = 24, Text = "π ≈ " };
        elapsedLabel = new Label { Left = 16, Top = 154, Width = 464, Height = 24, Text = "Elapsed: " };

        Controls.AddRange(new Control[]
        {
            algorithmLabel, algorithmComboBox,
            iterationsLabel, iterationsNumericUpDown,
            computeButton,
            progressBar,
            resultLabel,
            elapsedLabel
        });
    }

    private async void ComputeButtonOnClick(object? sender, EventArgs e)
    {
        if (cts != null)
        {
            cts.Cancel();
            return;
        }

        computeButton.Text = "Cancel";
        algorithmComboBox.Enabled = false;
        iterationsNumericUpDown.Enabled = false;
        progressBar.Value = 0;
        resultLabel.Text = "π ≈ ";
        elapsedLabel.Text = "Elapsed: ";

        cts = new CancellationTokenSource();
        var token = cts.Token;

        try
        {
            var algorithm = GetSelectedAlgorithm();
            int iterations = (int)iterationsNumericUpDown.Value;
            var calculator = PiCalculatorFactory.Create(algorithm);

            var progress = new Progress<double>(p =>
            {
                int value = Math.Min(100, Math.Max(0, (int)Math.Round(p * 100)));
                progressBar.Value = value;
            });

            var stopwatch = Stopwatch.StartNew();
            double pi = await Task.Run(() => calculator.Compute(iterations, progress, token), token);
            stopwatch.Stop();

            resultLabel.Text = $"π ≈ {pi:R}";
            elapsedLabel.Text = $"Elapsed: {stopwatch.ElapsedMilliseconds} ms";
        }
        catch (OperationCanceledException)
        {
            resultLabel.Text = "Canceled";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            cts?.Dispose();
            cts = null;
            computeButton.Text = "Compute";
            algorithmComboBox.Enabled = true;
            iterationsNumericUpDown.Enabled = true;
        }
    }

    private static PiAlgorithm GetSelectedAlgorithmFromText(string text)
    {
        return text switch
        {
            "Leibniz" => PiAlgorithm.Leibniz,
            "Nilakantha" => PiAlgorithm.Nilakantha,
            _ => PiAlgorithm.GaussLegendre
        };
    }

    private PiAlgorithm GetSelectedAlgorithm()
    {
        string selected = algorithmComboBox.SelectedItem?.ToString() ?? "Gauss-Legendre";
        return GetSelectedAlgorithmFromText(selected);
    }
}