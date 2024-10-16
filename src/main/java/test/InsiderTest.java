package test;

import listeners.CustomTestListener;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.*;
import pages.*;

import java.util.Set;

import static actions.AssertUrlAction.assertCurrentUrl;
import static actions.CheckForElementAction.checkElementIfDisplayed;
import static actions.ClickToElementAction.click;
import static actions.HoverToElementAction.hoverToElement;
import static managers.DriverManager.initializeDriver;
import static managers.DriverManager.quitDriver;
import static managers.WebDriverWaitManager.setDriverForSynchronization;

@Listeners(CustomTestListener.class)
public class InsiderTest {

    public WebDriver driver;
    public MainPage mainPage;
    public HeaderPage headerPage;
    public CareersPage careersPage;
    public QualityAssurancePage qualityAssurancePage;
    public OpenPositionPage openPositionPage;

    @Parameters({"browser"})
    @BeforeTest
    public void setup(String browser) {
        driver = initializeDriver(browser);
        setDriverForSynchronization();
        mainPage = new MainPage(driver);
        headerPage = new HeaderPage(driver);
        careersPage = new CareersPage(driver);
        qualityAssurancePage = new QualityAssurancePage(driver);
        openPositionPage = new OpenPositionPage(driver);
    }

    @AfterTest
    public void shutdown() {
        quitDriver();
    }

    @Test
    public void verifyUserOnInsider() throws InterruptedException {
        driver.get("https://useinsider.com/");
        assertCurrentUrl("https://useinsider.com/");
        Thread.sleep(500);
    }

    @Test
    public void checkCareers() {
        driver.get("https://useinsider.com/");
        click(headerPage.company);
        click(headerPage.career);
        checkElementIfDisplayed(careersPage.locations);
        checkElementIfDisplayed(careersPage.lifeAtInsider);
    }

    @Test
    public void jobList() throws InterruptedException {
        driver.get("https://useinsider.com/careers/quality-assurance/");
        click(qualityAssurancePage.seeAllJobs);
        Thread.sleep(500);
        click(openPositionPage.declineAll);
        click(openPositionPage.filterByLocationDropDown);
        Thread.sleep(500);
        click(openPositionPage.istanbulTurkeyChoice);
        click((openPositionPage.filterByDepartmentDropDown));
        Thread.sleep(1000);
        click(openPositionPage.qualityAssuranceChoice); // locator chosen mistakenly for test screenshot execution
    }

    @Test
    public void checkViewRole() throws InterruptedException {
        driver.get("https://useinsider.com/careers/quality-assurance/");
        click(openPositionPage.declineAll);
        Thread.sleep(1000);
        click(qualityAssurancePage.seeAllJobs);
        Thread.sleep(10000); // waiting back end api brings dropdown data
        click(openPositionPage.selectionArrow);
        Thread.sleep(3000);
        click(openPositionPage.istanbulTurkeyChoice);
        Thread.sleep(500);
        hoverToElement(openPositionPage.openPosition);
        click(openPositionPage.viewRole);
        Thread.sleep(8000);

        for (String tab : driver.getWindowHandles()) {
            if (!tab.equals(driver.getWindowHandle())) {
                driver.switchTo().window(tab);
                break;
            }
        }

        assertCurrentUrl("https://jobs.lever.co/useinsider/78ddbec0-16bf-4eab-b5a6-04facb993ddc");
    }

}