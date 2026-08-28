import { useState, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const price = (formData.get("price") as string)?.trim();
  const status = (formData.get("status") as string) || "ACTIVE";

  if (!title) {
    return {
      success: false,
      errors: { title: "Product title is required" },
    };
  }

  try {
    const response = await admin.graphql(
      `#graphql
        mutation createProduct($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id
              title
              descriptionHtml
              status
              variants(first: 5) {
                edges {
                  node {
                    id
                    price
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          product: {
            title,
            descriptionHtml: description ? `<p>${description}</p>` : undefined,
            status,
          },
        },
      },
    );

    const responseJson = await response.json();
    const userErrors = responseJson.data?.productCreate?.userErrors;

    if (userErrors && userErrors.length > 0) {
      return {
        success: false,
        error: userErrors.map((e: { message: string }) => e.message).join(", "),
      };
    }

    const createdProduct = responseJson.data?.productCreate?.product;

    // Update variant price if provided
    if (price && createdProduct?.variants?.edges?.[0]?.node?.id) {
      const variantId = createdProduct.variants.edges[0].node.id;
      await admin.graphql(
        `#graphql
          mutation updateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          variables: {
            productId: createdProduct.id,
            variants: [{ id: variantId, price }],
          },
        },
      );
    }

    return {
      success: true,
      message: `Product "${title}" created successfully!`,
      product: createdProduct,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return {
      success: false,
      error: message,
    };
  }
};

export default function CRUDPage() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("19.99");
  const [status, setStatus] = useState("ACTIVE");

  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      setTitle("");
      setDescription("");
      setPrice("19.99");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetcher.submit(
      {
        title,
        description,
        price,
        status,
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Create Product">
      <s-section heading="Create a new product">
        <s-paragraph>
          Fill in the details below to create a product directly in your store.
        </s-paragraph>

        <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Product Title *"
              name="title"
              value={title}
              placeholder="e.g. Premium Cotton T-Shirt"
              onChange={(e) => setTitle(e.currentTarget.value)}
              error={
                fetcher.data?.errors?.title
                  ? fetcher.data.errors.title
                  : undefined
              }
            />

            <s-text-field
              label="Description"
              name="description"
              value={description}
              placeholder="Provide a description of the product..."
              onChange={(e) => setDescription(e.currentTarget.value)}
            />

            <s-stack direction="inline" gap="base">
              <div style={{ flex: 1 }}>
                <s-text-field
                  label="Price ($)"
                  name="price"
                  value={price}
                  placeholder="19.99"
                  prefix="$"
                  onChange={(e) => setPrice(e.currentTarget.value)}
                />
              </div>

              <div style={{ flex: 1 }}>
                <s-select
                  label="Status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.currentTarget.value)}
                >
                  <s-option value="ACTIVE">Active</s-option>
                  <s-option value="DRAFT">Draft</s-option>
                  <s-option value="ARCHIVED">Archived</s-option>
                </s-select>
              </div>
            </s-stack>

            <div>
              <s-button
                type="submit"
                {...(isSubmitting ? { loading: true } : {})}
              >
                Create Product
              </s-button>
            </div>
          </s-stack>
        </form>

        {fetcher.data?.success && fetcher.data?.product && (
          <div style={{ marginTop: "1.5rem" }}>
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="small">
                <s-heading>Created Product Details</s-heading>
                <s-text>
                  <strong>Title:</strong> {fetcher.data.product.title}
                </s-text>
                <s-text>
                  <strong>ID:</strong> <code>{fetcher.data.product.id}</code>
                </s-text>
                <s-text>
                  <strong>Status:</strong> {fetcher.data.product.status}
                </s-text>
                <div style={{ marginTop: "0.5rem" }}>
                  <s-button
                    variant="tertiary"
                    onClick={() => {
                      shopify.intents.invoke?.("edit:shopify/Product", {
                        value: fetcher.data?.product?.id,
                      });
                    }}
                  >
                    Open in Shopify Admin
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};