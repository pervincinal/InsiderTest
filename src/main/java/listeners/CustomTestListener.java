package listeners;

import org.openqa.selenium.WebDriver;
import org.testng.ITestContext;
import org.testng.ITestListener;
import org.testng.ITestResult;
import org.testng.Reporter;
import test.InsiderTest;
import utils.ScreenshotUtil;

public class CustomTestListener implements ITestListener {

    @Override
    public void onTestFailure(ITestResult result) {
        Object currentClass = result.getInstance();
        WebDriver driver = ((InsiderTest) currentClass).driver;
        String screenshotPath = ScreenshotUtil.takeScreenshot(driver, result.getName());
        Reporter.log("Screenshot saved at: " + screenshotPath);
    }

    @Override
    public void onTestStart(ITestResult result) { }

    @Override
    public void onTestSuccess(ITestResult result) { }

    @Override
    public void onTestSkipped(ITestResult result) { }

    @Override
    public void onTestFailedButWithinSuccessPercentage(ITestResult result) { }

    @Override
    public void onStart(ITestContext context) { }

    @Override
    public void onFinish(ITestContext context) { }
}
