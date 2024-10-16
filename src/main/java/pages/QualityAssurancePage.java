package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class QualityAssurancePage {

    @FindBy(css = "a[class*='btn-outline-secondary']")
    public WebElement seeAllJobs;

    public QualityAssurancePage(WebDriver driver) {
        PageFactory.initElements(driver, this);
    }

}
