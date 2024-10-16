package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class OpenPositionPage {

    @FindBy(className = "select2-selection__arrow")
    public WebElement selectionArrow;
    @FindBy(css = "span[data-select2-id='1'] span[class='selection']")
    public WebElement filterByLocationDropDown;

    @FindBy(xpath = "//*[text() = 'Istanbul, Turkey']")
    public WebElement istanbulTurkeyChoice;

    @FindBy(xpath = "//*[@id='select2-filter-by-location-result-2cqm-Istanbul, Turkey']")
    public WebElement filterByDepartmentDropDown;

    @FindBy(id = "//*[@id='select2-filter-by-department-result-vkqg-Quality Assurance']")
    public WebElement qualityAssuranceChoice;

    @FindBy(xpath = "//a[@href='https://jobs.lever.co/useinsider/78ddbec0-16bf-4eab-b5a6-04facb993ddc']")
    public WebElement viewRole;

    @FindBy(xpath = "//div[contains(@class, 'bg-light')]")
    public WebElement openPosition;

    @FindBy(css = "a[data-cli_action='reject']")
    public WebElement declineAll;

    public OpenPositionPage(WebDriver driver) {
        PageFactory.initElements(driver, this);
    }
}
