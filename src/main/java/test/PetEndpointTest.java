package test;

import io.restassured.RestAssured;
import io.restassured.response.Response;
import org.json.JSONArray;
import org.json.JSONObject;
import org.testng.annotations.Test;

import java.io.File;

import static io.restassured.RestAssured.given;
import static org.testng.Assert.assertEquals;
public class PetEndpointTest {

    @Test
    public void uploadImageTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        File file = new File(System.getProperty("user.dir")+"/src/main/resources/files/example.txt");
        Response response = given()
                .header("accept", "application/json")
                .contentType("multipart/form-data")
                .multiPart("additionalMetadata", "1")
                .multiPart("file", file)
                .when()
                .post("/pet/1/uploadImage")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Image upload failed!");
    }

    @Test
    public void updatePetFormNegativeTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .contentType("application/x-www-form-urlencoded")
                // Missing name and status form params
                .when()
                .post("/pet/1")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Expected a 200 status code for missing form parameters!");
    }

    @Test
    public void uploadImageNegativeTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .contentType("multipart/form-data")
                .multiPart("additionalMetadata", "1")
                .when()
                .post("/pet/1/uploadImage")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 500, "Expected a 500 status code for missing file!");
    }

    @Test
    public void createPetTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";

        JSONObject categoryObject = new JSONObject();
        categoryObject.put("id", 1);
        categoryObject.put("name", "exampleName");

        JSONArray photoUrlsArray = new JSONArray();
        photoUrlsArray.put("exampleUrl");

        JSONArray tagsArray = new JSONArray();
        JSONObject tagObject = new JSONObject();
        tagObject.put("id", 0);
        tagObject.put("name", "pet");
        tagsArray.put(tagObject);

        JSONObject requestBody = new JSONObject();
        requestBody.put("id", 1);
        requestBody.put("category", categoryObject);
        requestBody.put("name", "doggie");
        requestBody.put("photoUrls", photoUrlsArray);
        requestBody.put("tags", tagsArray);
        requestBody.put("status", "available");

        Response response = given()
                .header("accept", "application/json")
                .header("Content-Type", "application/json")
                .body(requestBody)
                .when()
                .post("/pet")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Pet creation");
    }

    @Test
    public void createPetNegativeTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";

        JSONObject requestBody = new JSONObject();
        requestBody.put("id", "invalid_id");  // Invalid ID data

        Response response = given()
                .header("accept", "application/json")
                .header("Content-Type", "application/json")
                .body(requestBody.toString())
                .when()
                .post("/pet")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 500, "Expected a 500 status code for invalid pet creation!");
    }

    @Test
    public void updatePetFormTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .contentType("application/x-www-form-urlencoded")
                .formParam("name", "exampleName")
                .formParam("status", "sold")
                .when()
                .post("/pet/1")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Failed to update pet's name and status!");
    }

    @Test
    public void updatePetTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        JSONObject categoryObject = new JSONObject();
        categoryObject.put("id", 1);
        categoryObject.put("name", "exampleName");

        JSONArray photoUrlsArray = new JSONArray();
        photoUrlsArray.put("exampleUrl");

        JSONArray tagsArray = new JSONArray();
        JSONObject tagObject = new JSONObject();
        tagObject.put("id", 0);
        tagObject.put("name", "pet");
        tagsArray.put(tagObject);

        JSONObject requestBody = new JSONObject();
        requestBody.put("id", 1);
        requestBody.put("category", categoryObject);
        requestBody.put("name", "doggie");
        requestBody.put("photoUrls", photoUrlsArray);
        requestBody.put("tags", tagsArray);
        requestBody.put("status", "available");

        Response response = given()
                .header("accept", "application/json")
                .header("Content-Type", "application/json")
                .body(requestBody)
                .when()
                .put("/pet")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Pet update failed!");
    }

    @Test
    public void updatePetNegativeTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";

        JSONObject requestBody = new JSONObject();
        requestBody.put("id", "9@9999");  // Invalid pet ID

        Response response = given()
                .header("accept", "application/json")
                .header("Content-Type", "application/json")
                .body(requestBody.toString())
                .when()
                .put("/pet")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 500, "Expected a 404 status code for non-existent pet!");
    }

    @Test
    public void findPetsByStatusTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .queryParam("status", "sold") // Add query parameter
                .when()
                .get("/pet/findByStatus")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Failed to find pets by status!");
    }

    @Test
    public void findPetsByInvalidStatusTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .queryParam("status", "@@@")
                .when()
                .get("/pet/findByStatus")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Expected a 200 status code for invalid status!");
    }

    @Test
    public void getPetByIdTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .when()
                .get("/pet/1")
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Failed to get pet by ID!");
    }

    @Test
    public void getPetByInvalidIdTest() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2";
        Response response = given()
                .header("accept", "application/json")
                .when()
                .get("/pet/99999")  // Invalid ID
                .then()
                .extract()
                .response();
        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 200, "Expected a 200 status code for invalid pet ID!");
    }

    @Test
    public void deletePet() {
        RestAssured.baseURI = "https://petstore.swagger.io/v2/pet";
        Response response = given()
                .header("api_key", 4545)
                .header("Accept", "application/json")
                .when()
                .delete("/{petId}", 1)
                .then()
                .extract().response();

        System.out.println("Response: " + response.asString());
        assertEquals(response.getStatusCode(), 404, "Failed to delete pet information");
    }


}