// const express = require("express");
// const router = express.Router();
// const AWS = require("aws-sdk");

// // Save and Create Lambda Function
// router.post("/save", async (req, res) => {
//   const { awsAccessKeyId, awsSecretAccessKey, lambdaCode } = req.body;

//   const lambda = new AWS.Lambda({
//     accessKeyId: awsAccessKeyId,
//     secretAccessKey: awsSecretAccessKey,
//     region: "us-east-1", // You can change this or pass via frontend
//   });

//   try {
//     const functionName = "DashboardLambdaFunc";
//     const params = {
//       FunctionName: functionName,
//       Runtime: "nodejs18.x",
//       Role: "arn:aws:iam::your-account-id:role/your-lambda-execution-role", // Update this!
//       Handler: "index.handler",
//       Code: {
//         ZipFile: Buffer.from(lambdaCode), // Should be zipped properly in real apps
//       },
//     };

//     const result = await lambda.createFunction(params).promise();
//     res.status(200).json({ message: "Lambda created", functionArn: result.FunctionArn });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Trigger Lambda
// router.post("/trigger", async (req, res) => {
//   const { awsAccessKeyId, awsSecretAccessKey } = req.body;

//   const lambda = new AWS.Lambda({
//     accessKeyId: awsAccessKeyId,
//     secretAccessKey: awsSecretAccessKey,
//     region: "us-east-1",
//   });

//   try {
//     const result = await lambda
//       .invoke({
//         FunctionName: "DashboardLambdaFunc",
//         Payload: JSON.stringify({ trigger: "from-dashboard" }),
//       })
//       .promise();

//     res.status(200).json({ message: result.Payload });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });

// module.exports = router;

const express = require("express");
const router = express.Router();

// Dummy save Lambda endpoint (no real AWS call)
router.post("/save", async (req, res) => {
  const { awsAccessKeyId, awsSecretAccessKey, lambdaCode } = req.body;

  console.log("📝 Received Lambda Save Request:");
  console.log("Access Key:", awsAccessKeyId);
  console.log("Secret Key:", awsSecretAccessKey);
  console.log("Code Snippet:", lambdaCode);

  // Simulate saving logic
  return res.status(200).json({
    message: "✅ Lambda configuration saved successfully (dummy)",
  });
});

// Dummy trigger Lambda endpoint
router.post("/trigger", async (req, res) => {
  const { awsAccessKeyId, awsSecretAccessKey } = req.body;

  console.log("⚡ Trigger request received with keys:");
  console.log("Access Key:", awsAccessKeyId);
  console.log("Secret Key:", awsSecretAccessKey);

  // Simulate trigger logic
  return res.status(200).json({
    message: "🚀 Lambda function triggered successfully (dummy)",
  });
});

module.exports = router;
